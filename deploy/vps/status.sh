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
  printf '  %-18s → %s\n' "$h" "$(getent ahostsv4 "$h" | awk '{print $1}' | sort -u | tr '\n' ' ')"
done
echo "  AAAA airl.kz: $(getent ahostsv6 airl.kz | awk '{print $1}' | sort -u | tr '\n' ' ')"
echo "  this server: $(curl -s4 --max-time 8 https://api.ipify.org || true)"
echo "== old Firebase backend, seen from here (401 = deployed and asking for the password):"
for f in leadStats group interview; do
  printf '  %-10s %s\n' "$f" "$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "https://europe-west1-landing-page-8e314.cloudfunctions.net/$f")"
done
echo "== env files on this server that already hold an Anthropic key (paths only):"
grep -lsE '^ANTHROPIC_API_KEY=.{20,}' /root/*/.env* /opt/*/.env* /srv/*/.env* /home/*/*/.env* /etc/*.env 2>/dev/null | sed 's/^/  /' || true
echo "== HTTP checks through local nginx (Host: airl.kz):"
for p in / /kk/ /en/ /diagnostics /ai-for-work/ /airl-hub/ /lms/ru /event-master-coffee.jpg; do
  printf '  %-26s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code} %{size_download}B' -H 'Host: airl.kz' "http://127.0.0.1$p")"
done
if [ -f /etc/letsencrypt/live/airl.kz/fullchain.pem ]; then
  printf '  %-26s %s\n' "https /" "$(curl -s -o /dev/null -w '%{http_code}' --resolve airl.kz:443:127.0.0.1 https://airl.kz/)"
fi
echo "== disk: $(df -h / | tail -1 | awk '{print $4" free of "$2}')"
