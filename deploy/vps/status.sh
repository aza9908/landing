#!/usr/bin/env bash
# Отчёт о лендинге на VPS. Ничего не меняет.
echo "== repo: $(git -C /opt/airl-landing log --oneline -1 2>/dev/null || echo 'not installed')"
echo "== container: $(docker ps -a --filter name=^airl-landing$ --format '{{.Status}} {{.Ports}}')"
echo "== timer: $(systemctl is-active airl-landing-update.timer 2>/dev/null) · last runs:"
journalctl -u airl-landing-update --no-pager -n 5 -o cat 2>/dev/null | grep -v '^$' | tail -5
echo "== nginx site:"; grep -E 'server_name|listen|ssl_certificate ' /etc/nginx/sites-enabled/airl.kz 2>/dev/null
echo "== certificate:"; (openssl x509 -in /etc/letsencrypt/live/airl.kz/fullchain.pem -noout -enddate -ext subjectAltName 2>/dev/null) || echo "none yet"
echo "== DNS: airl.kz → $(getent ahostsv4 airl.kz | awk '{print $1}' | sort -u | tr '\n' ' ')· www → $(getent ahostsv4 www.airl.kz | awk '{print $1}' | sort -u | tr '\n' ' ')"
echo "== HTTP checks through local nginx (Host: airl.kz):"
for p in / /kk/ /en/ /diagnostics /ai-for-work/ /airl-hub/ /lms/ru /event-master-coffee.jpg; do
  printf '  %-26s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code} %{size_download}B' -H 'Host: airl.kz' "http://127.0.0.1$p")"
done
if [ -f /etc/letsencrypt/live/airl.kz/fullchain.pem ]; then
  printf '  %-26s %s\n' "https /" "$(curl -s -o /dev/null -w '%{http_code}' --resolve airl.kz:443:127.0.0.1 https://airl.kz/)"
fi
echo "== disk: $(df -h / | tail -1 | awk '{print $4" free of "$2}')"
