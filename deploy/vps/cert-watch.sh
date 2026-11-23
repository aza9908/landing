#!/usr/bin/env bash
# Раз в 10 минут: если имя сайта уже указывает на этот сервер, а в сертификате
# его ещё нет — довыпускаем сертификат. Не чаще раза в час, чтобы не упереться
# в лимиты Let's Encrypt.
set -uo pipefail
CERT=/etc/letsencrypt/live/airl.kz/fullchain.pem
STAMP=/var/lib/airl-landing/.cert-attempt
ME=$(curl -s4 --max-time 10 https://api.ipify.org || true)
[ -n "$ME" ] || exit 0
have=$(openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null || true)
need=""
for d in airl.kz www.airl.kz online.airl.kz; do
  ip=$( (getent ahostsv4 "$d" || true) | awk '{print $1}' | sort -u | tr '\n' ' ')
  case " $ip " in *" $ME "*) ;; *) continue;; esac
  echo "$have" | grep -q "DNS:$d\\b" || need="$need $d"
done
[ -n "$need" ] || exit 0
if [ -f "$STAMP" ] && [ $(( $(date +%s) - $(stat -c %Y "$STAMP") )) -lt 3600 ]; then exit 0; fi
touch "$STAMP"
echo "not in the certificate yet:$need — issuing"
/usr/local/bin/airl-landing-enable-https
