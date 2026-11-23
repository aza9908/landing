#!/usr/bin/env bash
# Отчёт о лендинге на VPS. Ничего не меняет.
echo "== repo: $(git -C /opt/airl-landing log --oneline -1 2>/dev/null || echo 'not installed')"
echo "== container: $(docker ps -a --filter name=^airl-landing$ --format '{{.Status}} {{.Ports}}')"
echo "== timer: $(systemctl is-active airl-landing-update.timer 2>/dev/null) · last runs:"
journalctl -u airl-landing-update --no-pager -n 5 -o cat 2>/dev/null | grep -v '^$' | tail -5
echo "== nginx site:"; grep -E 'server_name|listen|ssl_certificate ' /etc/nginx/sites-enabled/airl.kz 2>/dev/null
echo "== certificate:"; (openssl x509 -in /etc/letsencrypt/live/airl.kz/fullchain.pem -noout -enddate -ext subjectAltName 2>/dev/null) || echo "none yet"
ns() { (dig +short NS "$1" 2>/dev/null || host -t ns "$1" 2>/dev/null | awk '{print $NF}' || nslookup -type=ns "$1" 2>/dev/null | awk '/nameserver/{print $NF}') | tr '\n' ' '; }
echo "== DNS provider (NS of airl.kz): $(ns airl.kz)"
for h in airl.kz www.airl.kz online.airl.kz server.airl.kz; do
  printf '  %-18s → %s\n' "$h" "$( (getent ahostsv4 "$h" || true) | awk '{print $1}' | sort -u | tr '\n' ' ')"
done
echo "  AAAA airl.kz: $(getent ahostsv6 airl.kz | awk '{print $1}' | sort -u | tr '\n' ' ')"
echo "  this server: $(curl -s4 --max-time 8 https://api.ipify.org || true)"
echo "== what each authoritative nameserver answers (all must agree before Let's Encrypt can check a name):"
for n in $(ns airl.kz); do
  printf '  %-12s serial %s · airl.kz %s· www %s· online %s\n' "$n" \
    "$(dig +short +time=4 +tries=1 @"$n" airl.kz SOA 2>/dev/null | awk '{print $3}')" \
    "$(dig +short +time=4 +tries=1 @"$n" airl.kz A 2>/dev/null | tr '\n' ' ')" \
    "$(dig +short +time=4 +tries=1 @"$n" www.airl.kz A 2>/dev/null | tr '\n' ' ')" \
    "$(dig +short +time=4 +tries=1 @"$n" online.airl.kz A 2>/dev/null | tr '\n' ' ')"
done
echo "== each name as a visitor gets it (certificate verified strictly, no -k):"
for h in airl.kz www.airl.kz online.airl.kz; do
  printf '  http://%-16s → %s\n' "$h" "$(curl -s -o /dev/null --max-time 10 -w '%{http_code} %{redirect_url}' --resolve "$h:80:127.0.0.1" "http://$h/")"
  printf '  https://%-15s → %s\n' "$h" "$(curl -sS --max-time 10 --resolve "$h:443:127.0.0.1" -o /tmp/.airl-page -w '%{http_code} %{redirect_url}' "https://$h/" 2>&1 | tail -1) $(grep -o '<title>[^<]*' /tmp/.airl-page 2>/dev/null | head -1 | cut -c8-70)"
done
rm -f /tmp/.airl-page
echo "== old Firebase backend, seen from here (401 = deployed and asking for the password):"
for f in leadStats group interview; do
  printf '  %-10s %s\n' "$f" "$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "https://europe-west1-landing-page-8e314.cloudfunctions.net/$f")"
done
# Запросы идут в nginx этого сервера, минуя DNS: так видно, что сервер отдаст
# посетителям, даже пока домен ещё указывает на прежний хостинг.
if [ -f /etc/letsencrypt/live/airl.kz/fullchain.pem ]; then
  BASE="https://airl.kz"; VIA="--resolve airl.kz:443:127.0.0.1"
  echo "== pages served by this server over HTTPS (certificate verified by curl):"
else
  BASE="http://airl.kz"; VIA="--resolve airl.kz:80:127.0.0.1"
  echo "== pages served by this server over HTTP (no certificate yet):"
fi
for p in / /kk/ /en/ /diagnostics /ai-for-work/ /airl-hub/ /lms/ru /stats /admin /event-master-coffee.jpg; do
  printf '  %-26s %s\n' "$p" "$(curl -s $VIA -o /dev/null --max-time 25 -w '%{http_code} %{size_download}B' "$BASE$p")"
done
printf '  %-26s %s\n' "http → https redirect" "$(curl -s --resolve airl.kz:80:127.0.0.1 -o /dev/null -w '%{http_code} %{redirect_url}' http://airl.kz/kk/)"
echo "== own API:"
for p in /api/health /api/groups-public/ZZZZ9999 /api/leadStats; do
  printf '  %-28s %s\n' "$p" "$(curl -s $VIA --max-time 25 -w ' [%{http_code}]' "$BASE$p" | cut -c1-120)"
done
if docker inspect lms-api-1 >/dev/null 2>&1; then
  echo "== LMS under airl.kz (must match the answers under the old names):"
  OLDWEB="--resolve lms.magauin.kz:443:127.0.0.1"; OLDAPI="--resolve lms-api.magauin.kz:443:127.0.0.1"
  c() { curl -s -o /dev/null --max-time 25 -w '%{http_code}' "$@"; }
  printf '  %-34s %s (old name: %s)\n' "/lms/ru/login" "$(c $VIA "$BASE/lms/ru/login")" "$(c $OLDWEB -H 'x-airl-lms-proxy: 1' https://lms.magauin.kz/lms/ru/login)"
  printf '  %-34s %s (old name: %s)\n' "/lms-api/lessons (no login)" "$(c $VIA "$BASE/lms-api/lessons")" "$(c $OLDAPI https://lms-api.magauin.kz/lessons)"
  printf '  %-34s %s (old name: %s)\n' "/lms-api/auth/login (wrong pass)" "$(c $VIA -X POST -H 'content-type: application/json' -d '{"email":"nobody@example.com","password":"x"}' "$BASE/lms-api/auth/login")" "$(c $OLDAPI -X POST -H 'content-type: application/json' -d '{"email":"nobody@example.com","password":"x"}' https://lms-api.magauin.kz/auth/login)"
  printf '  %-34s %s (old name: %s)\n' "/lms-api/socket.io handshake" "$(curl -s $VIA --max-time 25 "$BASE/lms-api/socket.io/?EIO=4&transport=polling" | cut -c1-7)" "$(curl -s $OLDAPI --max-time 25 'https://lms-api.magauin.kz/socket.io/?EIO=4&transport=polling' | cut -c1-7)"
  KEY=$(docker exec lms-db-1 psql -U lms -d lms -tAc "select substring(image_url from '/lms-storage/.*') from lesson_blocks where image_url like '%/lms-storage/%' limit 1" 2>/dev/null | head -1)
  if [ -n "$KEY" ]; then
    printf '  %-34s %s (old name: %s)\n' "/lms-storage/<a lesson picture>" "$(c $VIA "$BASE$KEY")" "$(c $OLDAPI "https://lms-api.magauin.kz$KEY")"
  fi
  echo "  LMS built for: $(docker exec lms-web-1 sh -c 'grep -rhoE "https://[a-z0-9.-]+(/lms-api)?/auth/login|https://(lms-api\.magauin\.kz|airl\.kz/lms-api)" /app 2>/dev/null | sort | uniq -c | sort -rn | head -3' | tr -s ' ' | tr '\n' ';')"
  echo "  pictures in lessons still on the old name: $(docker exec lms-db-1 psql -U lms -d lms -tAc "select count(*) from lesson_blocks where image_url like '%magauin.kz%'" 2>/dev/null) · on airl.kz: $(docker exec lms-db-1 psql -U lms -d lms -tAc "select count(*) from lesson_blocks where image_url like 'https://airl.kz/%'" 2>/dev/null)"
  echo "  live lessons right now: $(docker exec lms-db-1 psql -U lms -d lms -tAc "select count(*) from live_sessions where status = 'live'" 2>/dev/null)"
fi
echo "== timers: deploy $(systemctl is-active airl-landing-update.timer) · backup $(systemctl is-active airl-landing-backup.timer) · cert-watch $(systemctl is-active airl-landing-cert.timer 2>/dev/null) · certbot renew $(systemctl is-active certbot.timer 2>/dev/null)"
printf '  %-28s %s\n' "POST /api/leads {} (no lead)" "$(curl -s $VIA --max-time 25 -w ' [%{http_code}]' -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/leads" | cut -c1-120)"
echo "== production path checks (nothing is sent or created):"
docker exec airl-landing node -e "
const s=require('/app/api/store').open(process.env.AIRL_DATA_DIR);
s.doc('config/selftest').set({at:new Date().toISOString()}).then(()=>console.log('  database: writable by the site')).catch(e=>console.log('  database: NOT writable: '+e.message))
 .then(()=>fetch('https://api.telegram.org/',{signal:AbortSignal.timeout(10000)})).then(r=>console.log('  telegram: reachable from the site (HTTP '+r.status+')')).catch(e=>console.log('  telegram: NOT reachable from the site: '+e.message))" 2>&1 | grep -v Warning
docker exec airl-landing node -e "
const t=async(n,u)=>{const a=Date.now();try{const r=await fetch(u,{signal:AbortSignal.timeout(20000)});console.log('  old backend from the site: '+n+' → HTTP '+r.status+' in '+(Date.now()-a)+'ms')}catch(e){const c=e.cause||{};console.log('  old backend from the site: '+n+' → FAILED in '+(Date.now()-a)+'ms: '+e.message+' / '+(c.code||'')+' '+(c.message||'')+' '+((c.errors||[]).map(x=>x.code+' '+x.address).join(', ')))}};
(async()=>{await t('firestore','https://firestore.googleapis.com/v1/projects/landing-page-8e314/databases/(default)/documents/groups_public/ZZZZ9999?key=AIzaSyDNSjN6mF5R5tVqrVtXeuOu3q6UtUdS39o');await t('functions','https://europe-west1-landing-page-8e314.cloudfunctions.net/leadStats?days=1');})()" 2>&1 | grep -v Warning
docker exec airl-landing node -e "
const dns=require('dns').promises,net=require('net');
const one=(host,ip)=>new Promise(r=>{const a=Date.now();const c=net.connect({host:ip,port:443,autoSelectFamily:false});c.setTimeout(8000);c.on('connect',()=>{c.destroy();r(Date.now()-a+'ms')});c.on('timeout',()=>{c.destroy();r('timeout')});c.on('error',e=>r('err '+e.code))});
(async()=>{for(const h of ['api.telegram.org','firestore.googleapis.com','api.anthropic.com']){const a=Date.now();let ip;try{ip=(await dns.lookup(h,{family:4})).address}catch(e){console.log('  '+h+': DNS failed '+e.code);continue}const d=Date.now()-a;const t=[];for(let i=0;i<5;i++)t.push(await one(h,ip));console.log('  connect from the site → '+h+': DNS '+d+'ms, TCP x5: '+t.join(' '))}})()" 2>&1 | grep -v Warning
echo "  from the host: TCP to firestore x3: $(for i in 1 2 3; do curl -4 -s -o /dev/null --max-time 10 -w '%{time_connect}s ' https://firestore.googleapis.com/; done)· telegram x3: $(for i in 1 2 3; do curl -4 -s -o /dev/null --max-time 10 -w '%{time_connect}s ' https://api.telegram.org/; done)"
echo "  from the host: firestore $(curl -s -o /dev/null --max-time 15 -w '%{http_code} in %{time_total}s' 'https://firestore.googleapis.com/v1/projects/landing-page-8e314/databases/(default)/documents/groups_public/ZZZZ9999?key=AIzaSyDNSjN6mF5R5tVqrVtXeuOu3q6UtUdS39o') · v4 only: $(curl -4 -s -o /dev/null --max-time 15 -w '%{http_code} in %{time_total}s' 'https://firestore.googleapis.com/') · v6 only: $(curl -6 -s -o /dev/null --max-time 8 -w '%{http_code} in %{time_total}s' 'https://firestore.googleapis.com/' 2>&1 | tail -1)"
echo "  site log, last errors: $(docker logs --since 24h airl-landing 2>&1 | grep -ci 'error\|failed') line(s) in 24h"
docker logs --since 24h airl-landing 2>&1 | grep -i 'error\|failed' | tail -3 | cut -c1-160 | sed 's/^/    /'
echo "== keys configured (names only): $(grep -oE '^[A-Z_]+=' /etc/airl-landing.env 2>/dev/null | tr -d '=' | tr '\n' ' ')"
echo "== data in /var/lib/airl-landing:"
docker exec airl-landing node -e "
const s=require('/app/api/store').open(process.env.AIRL_DATA_DIR);
for(const c of ['leads','express_diagnostics','groups','files'])console.log('  '+c+': '+s.count(c));
(async()=>{const a=await s.doc('config/admin').get();const l=await s.doc('config/legacy_import').get();
console.log('  panel password: '+(a.exists?'set ('+a.data().set_at+')':'not set yet — set on first login to /stats.html'));
console.log('  import from Firebase: '+(l.exists?'last '+l.data().last_at:'not run yet'));})()" 2>&1 | grep -v Warning
echo "  backups: $(ls /var/lib/airl-landing/backups 2>/dev/null | tr '\n' ' ')· timer $(systemctl is-active airl-landing-backup.timer 2>/dev/null)"
echo "== disk: $(df -h / | tail -1 | awk '{print $4" free of "$2}')"
