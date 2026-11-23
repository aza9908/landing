#!/usr/bin/env bash
# Сертификат Let's Encrypt для airl.kz. Запускать ПОСЛЕ того, как A-запись airl.kz
# указывает на этот сервер: иначе Let's Encrypt не сможет проверить домен.
set -euo pipefail
ME=$(curl -s4 --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')
DNS=$(getent ahostsv4 airl.kz | awk '{print $1}' | sort -u | tr '\n' ' ')
echo "server IP: $ME · airl.kz → $DNS"
case " $DNS " in *" $ME "*) ;; *) echo "airl.kz does not point here yet — change the DNS A record first."; exit 1;; esac
command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y -qq certbot; }
DOMAINS="-d airl.kz"
# Поддомены попадают в сертификат, только если уже указывают сюда; когда появится
# ещё один (например online.airl.kz), запустите скрипт снова — сертификат расширится.
for sub in www.airl.kz online.airl.kz; do
  W=$(getent ahostsv4 "$sub" | awk '{print $1}' | sort -u | tr '\n' ' ')
  case " $W " in *" $ME "*) DOMAINS="$DOMAINS -d $sub";; *) echo "skip $sub (→ ${W:-no record})";; esac
done
certbot certonly --webroot -w /var/www/certbot $DOMAINS --non-interactive --agree-tos \
  --register-unsafely-without-email --keep-until-expiring --expand --cert-name airl.kz \
  --deploy-hook "systemctl reload nginx"
# setup.sh видит сертификат и включает HTTPS-блок.
bash /opt/airl-landing/deploy/vps/setup.sh
curl -sS -o /dev/null -w "https://airl.kz/ → HTTP %{http_code}\n" --resolve airl.kz:443:127.0.0.1 https://airl.kz/
