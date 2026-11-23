# airl.kz на VPS (hoster.kz, server.airl.kz)

Лендинг работает на том же сервере, что и LMS, хаб и остальные проекты.

    nginx (:80/:443, airl.kz) → 127.0.0.1:3160 → контейнер airl-landing (node server.js)
                                                     ├─ /lms/…      → LMS (lms-web-1)
                                                     └─ /airl-hub/… → хаб (server.airl.kz)

* Код: `/opt/airl-landing` — клон публичного репозитория aza9908/landing.
* Автодеплой: таймер `airl-landing-update.timer` раз в минуту делает `git fetch`;
  если в `main` новый коммит, обновляет файлы и перезапускает контейнер.
  Пуш в `main` = публикация на сайте примерно через минуту.
* Логи: `journalctl -u airl-landing-update`, `docker logs airl-landing`.

## Данные и ключи

Заявки, результаты диагностики, коды групп и файлы агентов хранит сам сервер
(`api/`, раньше это делали Firestore и Cloud Functions):

* `/var/lib/airl-landing/airl.sqlite` — база; `files/` — Excel и презентации агентов;
  `backups/` — ночные копии базы (таймер `airl-landing-backup`, последние 14).
* `/etc/airl-landing.env` — ключи, доступен только root. `ANTHROPIC_API_KEY=...` добавляет владелец
  (нужен ИИ-агентам панели), затем `setup` ещё раз.
* Пароль панели (`/admin.html`, `/stats.html`) хранится в базе в виде хэша. При первом
  входе он сверяется со старой функцией в Firebase, поэтому остаётся прежним; тогда же
  переносится история заявок. Задать пароль явно: `AIRL_ADMIN_TOKEN=...` в env-файле.

Скрипты (идемпотентные, запускаются от root):

| скрипт            | что делает |
|-------------------|------------|
| `setup.sh`        | ставит/обновляет контейнер, сайт nginx (HTTP + ACME), таймер автодеплоя |
| `update.sh`       | одна итерация автодеплоя |
| `enable-https.sh` | выпускает сертификат Let's Encrypt — только когда DNS airl.kz уже указывает на этот сервер |
| `status.sh`       | отчёт: контейнер, nginx, DNS, сертификат, проверки HTTP |

Запуск без SSH — workflow «Landing on VPS» в репозитории aza9908/CRM-vibecoding
(там уже лежат секреты доступа к серверу): modes `status`, `setup`, `https`.
