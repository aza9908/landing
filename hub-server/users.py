#!/usr/bin/env python3
"""AIRL Hub — пользователи, роли и доступ к агенту КП.

Один код для двух входов: команда `airl-hub user ...` на сервере и раздел
«Пользователи» в хабе (служба агентов). Пароли хранятся только в виде хеша
в файлах, которые читает nginx; сами пароли нигде не записываются.

Роли:
  superadmin  разработчик: видит всё и управляет пользователями
  admin       руководитель: видит всё, включая данные 1С
  user        сотрудник: без данных 1С

Файлы паролей меняются на месте, без замены файла: служба агентов видит
каталог /etc/airl-1c-hub только для записи в свои файлы и создавать новые там не может.
"""
import contextlib, datetime as dt, fcntl, getpass, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
AUTH = os.environ.get("HUB_AUTH_DIR", "/etc/airl-1c-hub")
WEB_DIR = os.environ.get("HUB_WEB_DIR", os.path.join(HERE, "web"))
DATA_DIR = os.environ.get("HUB_DATA_DIR", os.path.join(HERE, "data"))
STATE = os.path.join(DATA_DIR, "agents")
HT = os.path.join(AUTH, "htpasswd")                 # все пользователи
HT_ADMIN = os.path.join(AUTH, "htpasswd-admin")     # те, кому nginx отдаёт данные 1С
ROLES_F = os.path.join(AUTH, "roles")
ROLES_JSON = os.path.join(WEB_DIR, "private", "roles.json")
KP_ACCESS = os.path.join(STATE, "kp_access.json")
ROLE_NAMES = ("superadmin", "admin", "user")
ROLE_RU = {"superadmin": "суперадмин", "admin": "руководитель", "user": "сотрудник"}
NAME_RE = re.compile(r"[a-z0-9][a-z0-9._-]{1,30}")
TZ = dt.timezone(dt.timedelta(hours=5))


class UserError(Exception):
    """Ошибка, текст которой можно показать человеку."""


@contextlib.contextmanager
def locked():
    os.makedirs(STATE, exist_ok=True)
    with open(os.path.join(STATE, ".users.lock"), "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        yield


def _pairs(path):
    """Файл вида «имя:значение» → словарь с сохранением порядка строк."""
    out = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.rstrip("\n")
                if ":" in line and not line.startswith("#"):
                    k, v = line.split(":", 1)
                    if k:
                        out[k] = v
    except FileNotFoundError:
        pass
    except PermissionError:
        raise UserError(f"Нет доступа к файлу {path}. Запустите обновление сервера.") from None
    return out


def _write_inplace(path, text):
    """Перезаписывает файл на месте: сначала новое содержимое, потом обрезка хвоста,
    так что файл ни на миг не остаётся пустым."""
    data = text.encode("utf-8")
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT, 0o640)
    except PermissionError:
        raise UserError(f"Служба не может записать {path}. Запустите обновление сервера.") from None
    try:
        done = 0
        while done < len(data):
            done += os.write(fd, data[done:])
        os.ftruncate(fd, len(data))
        os.fsync(fd)
    finally:
        os.close(fd)


def _backup():
    """Копия файлов паролей перед изменением; храним последние 20."""
    d = os.path.join(STATE, "auth-backup")
    os.makedirs(d, mode=0o700, exist_ok=True)
    stamp = dt.datetime.now(TZ).strftime("%Y%m%d-%H%M%S-%f")
    for src in (HT, ROLES_F):
        if os.path.exists(src):
            dst = os.path.join(d, f"{stamp}-{os.path.basename(src)}")
            shutil.copyfile(src, dst)
            os.chmod(dst, 0o600)
    for old in sorted(os.listdir(d))[:-40]:
        os.remove(os.path.join(d, old))


def _kp():
    try:
        with open(KP_ACCESS, encoding="utf-8") as f:
            v = json.load(f)
        return [u for u in v if isinstance(u, str)]
    except Exception:  # noqa
        return []


def _write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(path + ".tmp", path)


def _save(ht, roles, backup=True):
    """Записывает пользователей и всё, что из них выводится."""
    roles = {u: (roles.get(u) if roles.get(u) in ROLE_NAMES else "user") for u in ht}
    if backup:
        _backup()
    _write_inplace(HT, "".join(f"{u}:{h}\n" for u, h in ht.items()))
    _write_inplace(ROLES_F, "".join(f"{u}:{r}\n" for u, r in roles.items()))
    _write_inplace(HT_ADMIN, "".join(f"{u}:{h}\n" for u, h in ht.items() if roles[u] in ("superadmin", "admin")))
    _write_json(ROLES_JSON, roles)
    kp = [u for u in _kp() if u in ht]
    if kp != _kp():
        _write_json(KP_ACCESS, sorted(kp))


def _load():
    return _pairs(HT), _pairs(ROLES_F)


def _guard(before, after):
    """Не даём остаться без того, кто может управлять хабом."""
    top = lambda roles, names: sum(1 for r in roles.values() if r in names)
    if top(before, ("superadmin",)) and not top(after, ("superadmin",)):
        raise UserError("Нельзя: в хабе не останется ни одного суперадмина.")
    if top(before, ("superadmin", "admin")) and not top(after, ("superadmin", "admin")):
        raise UserError("Нельзя: не останется ни одного руководителя.")


def _check_name(user):
    if not NAME_RE.fullmatch(user or ""):
        raise UserError("Логин: от 2 до 31 знака, маленькие латинские буквы, цифры, точка, дефис или подчёркивание.")


def _check_role(role):
    if role not in ROLE_NAMES:
        raise UserError("Роль должна быть superadmin, admin или user.")


def _hash(password):
    if not isinstance(password, str) or len(password) < 8:
        raise UserError("Пароль должен быть не короче 8 знаков.")
    if len(password) > 128 or "\n" in password or "\r" in password:
        raise UserError("Пароль слишком длинный или содержит перенос строки.")
    try:   # SHA-512 crypt; пароль передаём через stdin, чтобы его не было видно в списке процессов
        out = subprocess.run(["openssl", "passwd", "-6", "-stdin"], input=password + "\n", text=True,
                             capture_output=True, check=True, timeout=20).stdout.strip()
    except Exception:  # noqa
        raise UserError("Не удалось зашифровать пароль на сервере.") from None
    if not out.startswith("$6$"):
        raise UserError("Не удалось зашифровать пароль на сервере.")
    return out


# ---------------------------------------------------------------- действия

def list_users():
    ht, roles = _load()
    kp = set(_kp())
    order = {r: i for i, r in enumerate(ROLE_NAMES)}
    rows = [dict(user=u, role=roles.get(u) if roles.get(u) in ROLE_NAMES else "user", kp=u in kp) for u in ht]
    return sorted(rows, key=lambda r: (order[r["role"]], r["user"]))


def add(user, role, password):
    _check_name(user); _check_role(role)
    h = _hash(password)
    with locked():
        ht, roles = _load()
        if user in ht:
            raise UserError(f"Пользователь {user} уже есть.")
        ht[user] = h
        roles[user] = role
        _save(ht, roles)


def passwd(user, password):
    h = _hash(password)
    with locked():
        ht, roles = _load()
        if user not in ht:
            raise UserError(f"Нет пользователя {user}.")
        ht[user] = h
        _save(ht, roles)


def upsert(user, role, password):
    """Создать, а если уже есть — поставить этот пароль и эту роль."""
    _check_name(user); _check_role(role)
    h = _hash(password)
    with locked():
        ht, roles = _load()
        after = dict(roles, **{user: role})
        _guard({u: roles.get(u, "user") for u in ht}, {u: after.get(u, "user") for u in list(ht) + [user]})
        created = user not in ht
        ht[user] = h
        _save(ht, after)
    return created


def set_role(user, role):
    _check_role(role)
    with locked():
        ht, roles = _load()
        if user not in ht:
            raise UserError(f"Нет пользователя {user}.")
        after = dict(roles, **{user: role})
        _guard({u: roles.get(u, "user") for u in ht}, {u: after.get(u, "user") for u in ht})
        _save(ht, after)


def delete(user):
    with locked():
        ht, roles = _load()
        if user not in ht:
            raise UserError(f"Нет пользователя {user}.")
        before = {u: roles.get(u, "user") for u in ht}
        del ht[user]
        _guard(before, {u: roles.get(u, "user") for u in ht})
        _save(ht, roles)


def set_kp(user, allow):
    with locked():
        ht, _ = _load()
        if allow and user not in ht:
            raise UserError(f"Нет пользователя {user}.")
        kp = [u for u in _kp() if u != user and u in ht] + ([user] if allow else [])
        _write_json(KP_ACCESS, sorted(kp))


def rebuild():
    """Пересобирает производные файлы из списка пользователей (после обновления сервера)."""
    with locked():
        ht, roles = _load()
        _save(ht, roles, backup=False)


def audit(by, action, user, role=None):
    """Журнал изменений: кто, что и с кем сделал. Паролей в нём нет."""
    try:
        os.makedirs(STATE, exist_ok=True)
        with open(os.path.join(STATE, "users_audit.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(dict(at=dt.datetime.now(TZ).isoformat(timespec="seconds"), by=by, action=action,
                                    user=user, role=role), ensure_ascii=False) + "\n")
    except Exception:  # noqa
        pass


def recent_audit(n=20):
    """Последние изменения пользователей, новые сверху."""
    try:
        with open(os.path.join(STATE, "users_audit.jsonl"), encoding="utf-8") as f:
            rows = [json.loads(x) for x in f.readlines()[-n:] if x.strip()]
        return rows[::-1]
    except Exception:  # noqa
        return []


# ---------------------------------------------------------------- команда на сервере

def _ask_password(user):
    pw = os.environ.get("HUB_NEW_PASSWORD", "")
    if pw:
        return pw
    a = getpass.getpass(f"Пароль для {user}: ")
    if a != getpass.getpass("Ещё раз: "):
        raise UserError("Пароли не совпали.")
    return a


def main(argv):
    usage = ("airl-hub user list | add ЛОГИН РОЛЬ | set ЛОГИН РОЛЬ | role ЛОГИН РОЛЬ | passwd ЛОГИН | del ЛОГИН\n"
             "airl-hub kp list | allow ЛОГИН | deny ЛОГИН\n"
             "роли: superadmin (разработчик), admin (руководитель), user (сотрудник, без данных 1С)")
    group = argv[0] if argv else ""
    cmd = argv[1] if len(argv) > 1 else "list"
    arg = lambda i, default="": argv[i].strip() if len(argv) > i else default
    try:
        if group == "user":
            if cmd == "list":
                print(f"{'ЛОГИН':<22}{'РОЛЬ':<14}АГЕНТ КП")
                for r in list_users():
                    print(f"{r['user']:<22}{r['role']:<14}{'да' if r['kp'] or r['role'] == 'superadmin' else '—'}")
            elif cmd == "add":
                user, role = arg(2).lower(), arg(3, "user")
                _check_name(user); _check_role(role)
                add(user, role, _ask_password(user)); audit("сервер", "add", user, role)
                print(f"Добавлен {user} с ролью {role}")
            elif cmd == "set":
                user, role = arg(2).lower(), arg(3, "user")
                _check_name(user); _check_role(role)
                created = upsert(user, role, _ask_password(user)); audit("сервер", "set", user, role)
                print(f"{'Добавлен' if created else 'Обновлён'} {user}: роль {role}, пароль задан")
            elif cmd == "passwd":
                user = arg(2).lower()
                if user not in _pairs(HT):
                    raise UserError(f"Нет пользователя {user}.")
                passwd(user, _ask_password(user)); audit("сервер", "passwd", user)
                print(f"Пароль {user} изменён")
            elif cmd == "role":
                set_role(arg(2).lower(), arg(3)); audit("сервер", "role", arg(2).lower(), arg(3))
                print(f"{arg(2).lower()} теперь {arg(3)}")
            elif cmd == "del":
                delete(arg(2).lower()); audit("сервер", "del", arg(2).lower())
                print(f"Удалён {arg(2).lower()}")
            elif cmd == "rebuild":
                rebuild()
            else:
                print(usage)
        elif group == "kp":
            if cmd == "allow":
                set_kp(arg(2).lower(), True); audit("сервер", "kp-allow", arg(2).lower())
                print(f"{arg(2).lower()} теперь видит агента КП")
            elif cmd == "deny":
                set_kp(arg(2).lower(), False); audit("сервер", "kp-deny", arg(2).lower())
                print(f"{arg(2).lower()} больше не видит агента КП")
            else:
                print("Доступ к агенту КП: суперадмин и " + (", ".join(_kp()) or "никто больше"))
        else:
            print(usage)
    except UserError as e:
        print(e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
