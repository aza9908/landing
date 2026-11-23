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
echo "== nginx sites that name airl.kz hosts:"
grep -rnE 'server_name' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | grep -E 'airl\.kz' | sed -E 's/[[:space:]]+/ /g' | sed 's/^/  /'
nginx -t 2>&1 | grep -i 'conflicting' | sed 's/^/  /'
for h in airl.kz www.airl.kz online.airl.kz; do
  printf '  port 80, Host %-16s → %s\n' "$h" "$(curl -s -o /dev/null --max-time 10 -w '%{http_code} %{redirect_url}' -H "Host: $h" http://127.0.0.1/)"
  printf '  port 443, SNI %-16s → %s\n' "$h" "$(curl -sk --max-time 10 --resolve "$h:443:127.0.0.1" "https://$h/" | grep -o '<title>[^<]*' | head -1 | cut -c1-90)"
done
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
echo "== timers: deploy $(systemctl is-active airl-landing-update.timer) · backup $(systemctl is-active airl-landing-backup.timer) · cert-watch $(systemctl is-active airl-landing-cert.timer 2>/dev/null) · certbot renew $(systemctl is-active certbot.timer 2>/dev/null)"
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
