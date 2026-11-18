#!/usr/bin/env python3
"""AIRL 1C Hub — синхронизация 1С (OData) -> локальная копия + data.json для дашборда.

Только стандартная библиотека Python 3.8+.

  sync.py            быстрый режим: только нужные дашборду наборы
  sync.py --full     полное зеркало: все доступные наборы данных OData

Настройки берутся из переменных окружения:
  ODATA_URL, ODATA_USER, ODATA_PASS  — доступ к 1С
  BITRIX_WEBHOOK — адрес входящего вебхука Bitrix24 (необязательно),
                   вида https://<портал>/rest/<id>/<ключ>
  HUB_DATA_DIR  — куда класть сырые данные (по умолчанию ./data)
  HUB_WEB_DIR   — куда класть data.json (по умолчанию ./web)
"""
import base64, datetime as dt, gzip, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

URL = os.environ.get("ODATA_URL", "").rstrip("/")
USER = os.environ.get("ODATA_USER", "")
PASS = os.environ.get("ODATA_PASS", "")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("HUB_DATA_DIR", os.path.join(HERE, "data"))
WEB_DIR = os.environ.get("HUB_WEB_DIR", os.path.join(HERE, "web"))
BITRIX = os.environ.get("BITRIX_WEBHOOK", "").strip().rstrip("/")
if BITRIX.endswith(".json"):          # вставили адрес целиком, с /profile.json
    BITRIX = BITRIX.rsplit("/", 1)[0]
ZERO = "00000000-0000-0000-0000-000000000000"
TZ = dt.timezone(dt.timedelta(hours=5))   # Казахстан

CORE = [
    "AccountingRegister_Типовой", "ChartOfAccounts_Типовой",
    "Catalog_Организации", "Catalog_Контрагенты", "Catalog_Номенклатура",
    "Catalog_СотрудникиОрганизаций", "Catalog_ДолжностиОрганизаций",
    "Document_РеализацияТоваровУслуг", "Document_ПоступлениеТоваровУслуг",
    "Document_ПлатежноеПоручениеВходящее", "Document_ПлатежноеПоручениеИсходящее",
    "Document_ПлатежныйОрдерСписаниеДенежныхСредств", "Document_СчетНаОплатуПокупателю",
]


def fetch(entity):
    """Возвращает список записей набора или None (нет доступа / ошибка)."""
    q = URL + "/" + urllib.parse.quote(entity) + "?$format=json"
    req = urllib.request.Request(q)
    tok = base64.b64encode(f"{USER}:{PASS}".encode()).decode()
    req.add_header("Authorization", "Basic " + tok)
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read().decode("utf-8-sig")).get("value", [])
    except Exception as e:  # noqa
        return None


def entity_list():
    return [x["name"] for x in (fetch("") or [])]


def save_raw(day_dir, name, rows):
    with gzip.open(os.path.join(day_dir, name + ".json.gz"), "wt", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)


def mirror(full):
    """Скачивает наборы, сохраняет сырые копии, возвращает dict name -> rows."""
    names = CORE
    if full:
        names = [n for n in entity_list() if not n.endswith("_RecordType")]
        # табличные части (Document_X_Товары) уже лежат внутри самих документов
        heads = set(names)
        names = [n for n in names if not ("_" in n.split("_", 1)[-1] and n.rsplit("_", 1)[0] in heads)]
        names = sorted(set(names) | set(CORE))
    day_dir = os.path.join(DATA_DIR, "raw", dt.date.today().isoformat())
    os.makedirs(day_dir, exist_ok=True)
    out, stats = {}, {"ok": 0, "empty": 0, "denied": 0}
    with ThreadPoolExecutor(8) as ex:
        for name, rows in zip(names, ex.map(fetch, names)):
            if rows is None:
                stats["denied"] += 1
            elif not rows:
                stats["empty"] += 1
            else:
                stats["ok"] += 1
                save_raw(day_dir, name, rows)
                out[name] = rows
    latest = os.path.join(DATA_DIR, "raw", "latest")
    try:
        if os.path.islink(latest):
            os.unlink(latest)
        os.symlink(day_dir, latest)
    except OSError:
        pass
    print(f"mirror({'full' if full else 'core'}): {stats} -> {day_dir}")
    missing = [n for n in CORE if n not in out and n not in ("Catalog_Номенклатура",)]
    return out, missing


# ---------------------------------------------------------------- аналитика

def ym(s):
    return s[:7]


def month_range(a, b):
    y, m = int(a[:4]), int(a[5:7])
    res = []
    while f"{y:04d}-{m:02d}" <= b:
        res.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return res


def month_end(k):
    y, m = int(k[:4]), int(k[5:7])
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - dt.timedelta(days=1)).isoformat()


def exp_cat(cr):
    if cr == "3350": return "Оплата труда"
    if cr[:2] in ("31", "32"): return "Налоги и взносы с ФОТ"
    if cr[:2] == "33": return "Услуги подрядчиков"
    if cr[:2] == "12": return "Подотчётные расходы"
    if cr[:2] == "10": return "Банковские комиссии"
    return "Прочее"


def in_cat(cr):
    if cr[:2] in ("30", "40"): return "Займы полученные"
    if cr[:2] in ("12", "35"): return "Оплаты покупателей"
    return "Прочие поступления"


def out_cat(dr):
    if dr == "3350": return "Зарплата"
    if dr[:2] in ("31", "32"): return "Налоги и взносы"
    if dr[:2] in ("33", "17"): return "Поставщики"
    if dr[:2] == "12": return "Подотчёт"
    if dr[:1] == "7": return "Комиссии банка"
    if dr[:2] in ("30", "40"): return "Погашение займов"
    return "Прочие выплаты"


def build(d):
    acc = {x["Ref_Key"]: x for x in d["ChartOfAccounts_Типовой"]}
    code = lambda k: acc.get(k, {}).get("Code", "?")
    orgs = {x["Ref_Key"]: x["Description"] for x in d.get("Catalog_Организации", [])}
    ka = {x["Ref_Key"]: x["Description"] for x in d.get("Catalog_Контрагенты", [])}
    posts = {x["Ref_Key"]: x["Description"] for x in d.get("Catalog_ДолжностиОрганизаций", [])}

    recs = []
    for x in d["AccountingRegister_Типовой"]:
        closing = x.get("Recorder_Type", "").endswith("ЗакрытиеМесяца")
        for r in x["RecordSet"]:
            if r.get("Active"):
                recs.append((r["Period"], code(r["AccountDr_Key"]), code(r["AccountCr_Key"]),
                             float(r["Сумма"] or 0), closing, r.get("Организация_Key")))
    recs.sort()
    if not recs:
        raise SystemExit("В регистре бухгалтерии нет проводок")
    months = month_range(ym(recs[0][0]), ym(recs[-1][0]))
    M = {k: dict(ym=k, revenue=0, expenses=0, cash_in=0, cash_out=0, payroll=0) for k in months}
    exp_by = defaultdict(lambda: defaultdict(float))
    in_by = defaultdict(lambda: defaultdict(float))
    out_by = defaultdict(lambda: defaultdict(float))
    bal = defaultdict(lambda: [0.0, 0.0])
    active_orgs = set()
    for per, dr, cr, s, closing, org in recs:
        k = ym(per)
        active_orgs.add(orgs.get(org, "?"))
        bal[dr][0] += s
        bal[cr][1] += s
        if not closing:
            if cr[:1] == "6": M[k]["revenue"] += s
            if dr[:1] == "6": M[k]["revenue"] -= s
            if dr[:1] == "7":
                M[k]["expenses"] += s
                exp_by[exp_cat(cr)][k] += s
                if cr == "3350": M[k]["payroll"] += s
            if cr[:1] == "7" and dr[:1] != "5": M[k]["expenses"] -= s
        dcash, ccash = dr[:2] == "10", cr[:2] == "10"
        if dcash and not ccash:
            M[k]["cash_in"] += s
            in_by[in_cat(cr)][k] += s
        if ccash and not dcash:
            M[k]["cash_out"] += s
            out_by[out_cat(dr)][k] += s

    cash = 0
    for k in months:
        m = M[k]
        cash += m["cash_in"] - m["cash_out"]
        m["cash_end"] = cash
        m["profit"] = m["revenue"] - m["expenses"]

    def saldo(pred, passive=False):
        t = sum(v[0] - v[1] for c, v in bal.items() if pred(c))
        return -t if passive else t

    # сотрудники
    staff = []
    for e in d.get("Catalog_СотрудникиОрганизаций", []):
        if e.get("DeletionMark") or e.get("IsFolder"):
            continue
        hired = (e.get("ДатаПриемаНаРаботу") or "")[:10]
        fired = (e.get("ДатаУвольнения") or "")[:10]
        if hired.startswith("0001"): hired = ""
        if fired.startswith("0001"): fired = ""
        staff.append(dict(name=e["Description"], hired=hired, fired=fired,
                          position=posts.get(e.get("ТекущаяДолжностьОрганизации_Key"), "")))
    staff.sort(key=lambda s: (bool(s["fired"]), s["hired"]))
    for k in months:
        a, b = k + "-01", month_end(k)
        M[k]["headcount"] = sum(1 for s in staff if s["hired"] and s["hired"] <= b
                                and (not s["fired"] or s["fired"] >= a))
    last_day = recs[-1][0][:10]
    headcount_now = sum(1 for s in staff if s["hired"] and s["hired"] <= last_day
                        and (not s["fired"] or s["fired"] > last_day))

    def docs(name):
        return [x for x in d.get(name, []) if not x.get("DeletionMark") and x.get("Posted", True)]

    # клиенты / поставщики
    cust = defaultdict(lambda: dict(revenue=0.0, paid=0.0))
    for x in docs("Document_РеализацияТоваровУслуг"):
        cust[ka.get(x["Контрагент_Key"], "—")]["revenue"] += float(x["СуммаДокумента"] or 0)
    pay_by_base = defaultdict(float)
    for x in docs("Document_ПлатежноеПоручениеВходящее"):
        if x.get("ВидОперации") == "ОплатаПокупателя":
            cust[ka.get(x["Контрагент_Key"], "—")]["paid"] += float(x["СуммаДокумента"] or 0)
        if x.get("ДокументОснование") and x["ДокументОснование"] != ZERO:
            pay_by_base[x["ДокументОснование"]] += float(x["СуммаДокумента"] or 0)
    supp = defaultdict(lambda: dict(amount=0.0, what=set()))
    for x in docs("Document_ПоступлениеТоваровУслуг"):
        s = supp[ka.get(x["Контрагент_Key"], "—")]
        s["amount"] += float(x["СуммаДокумента"] or 0)
        for row in (x.get("Услуги") or []) + (x.get("Товары") or []):
            if row.get("Содержание"): s["what"].add(row["Содержание"].strip())

    invoices = []
    for x in d.get("Document_СчетНаОплатуПокупателю", []):
        if x.get("DeletionMark"):
            continue
        amt = float(x["СуммаДокумента"] or 0)
        paid = pay_by_base.get(x["Ref_Key"], 0.0)
        rows = (x.get("Услуги") or []) + (x.get("Товары") or [])
        invoices.append(dict(date=x["Date"][:10], number=x["Number"].lstrip("0") or "0",
                             customer=ka.get(x["Контрагент_Key"], "—"), amount=amt, paid=min(paid, amt),
                             what=(rows[0].get("Содержание") or "") if rows else "",
                             status="paid" if paid >= amt and amt else ("partial" if paid else "open")))
    invoices.sort(key=lambda i: i["date"], reverse=True)

    ops = []
    for name, sign in (("Document_ПлатежноеПоручениеВходящее", 1),
                       ("Document_ПлатежноеПоручениеИсходящее", -1),
                       ("Document_ПлатежныйОрдерСписаниеДенежныхСредств", -1)):
        for x in docs(name):
            ops.append(dict(date=x["Date"][:10], amount=sign * float(x["СуммаДокумента"] or 0),
                            party=ka.get(x.get("Контрагент_Key"), "—"),
                            note=(x.get("НазначениеПлатежа") or x.get("Комментарий") or x.get("ВидОперации") or "")[:160]))
    ops.sort(key=lambda o: o["date"], reverse=True)

    liab = []
    for c in sorted(bal):
        if c[:1] in ("3", "4"):
            v = bal[c][1] - bal[c][0]
            if abs(v) >= 1:
                name = next((a["Description"] for a in acc.values() if a["Code"] == c), c)
                liab.append(dict(code=c, name=name, amount=v))

    cash_now = saldo(lambda c: c[:2] == "10")
    full = months[-3:]
    oper_out = sum(M[k]["cash_out"] for k in full) / len(full)
    cust_in = sum(in_by["Оплаты покупателей"].get(k, 0) for k in full) / len(full)
    burn = oper_out - cust_in
    kpi = dict(
        cash=cash_now,
        revenue=sum(m["revenue"] for m in M.values()),
        expenses=sum(m["expenses"] for m in M.values()),
        loans=saldo(lambda c: c[:2] in ("30", "40"), True),
        tax_debt=saldo(lambda c: c[:2] in ("31", "32"), True),
        payroll_debt=saldo(lambda c: c == "3350", True),
        receivables=saldo(lambda c: c[:3] == "121"),
        payables=saldo(lambda c: c[:3] == "331", True),
        advances_given=saldo(lambda c: c[:2] == "17"),
        advances_received=saldo(lambda c: c[:2] == "35", True),
        headcount=headcount_now,
        burn=burn, burn_months=len(full),
        runway=(cash_now / burn) if burn > 0 else None,
        invoiced_open=sum(i["amount"] - i["paid"] for i in invoices),
    )
    kpi["profit"] = kpi["revenue"] - kpi["expenses"]
    kpi = {k: (round(v) + 0 if isinstance(v, float) and k != "runway" else v) for k, v in kpi.items()}

    warn = []
    if cash_now < burn:
        warn.append(f"Остаток денег ({cash_now:,.0f} ₸) меньше среднемесячного оттока ({burn:,.0f} ₸).".replace(",", " "))
    for c, v in sorted(bal.items()):
        if c[:2] == "10" and v[0] - v[1] < -0.5:
            warn.append(f"Счёт {c}: отрицательный остаток денег ({v[0]-v[1]:,.0f} ₸) — в учёте не хватает приходного документа.".replace(",", " "))
        if c[:1] in ("6", "7") and abs(v[0] - v[1]) > 0.5:
            warn.append(f"Счёт {c} не закрыт в ноль (сальдо {v[0]-v[1]:,.0f} ₸) — стоит перепровести «Закрытие месяца».".replace(",", " "))
    if staff and headcount_now == 0:
        warn.append(f"По данным 1С в организации нет действующих сотрудников: все уволены не позднее {max(x['fired'] for x in staff)}.")
    today = dt.date.today().isoformat()
    if ym(last_day) < ym(today):
        warn.append(f"Последняя проводка в 1С датирована {last_day}: операции за текущий месяц ещё не внесены.")

    def series(by):
        return [dict(name=n, values=[round(v.get(k, 0)) for k in months], total=round(sum(v.values())))
                for n, v in sorted(by.items(), key=lambda kv: -sum(kv[1].values()))]

    return dict(
        generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        data_through=last_day, orgs=sorted(active_orgs), months=[M[k] for k in months], kpi=kpi,
        expense_structure=series(exp_by), cash_in=series(in_by), cash_out=series(out_by),
        customers=sorted(({"name": n, **v} for n, v in cust.items()), key=lambda c: -max(c["revenue"], c["paid"])),
        suppliers=sorted(({"name": n, "amount": v["amount"], "what": "; ".join(sorted(v["what"]))[:200]}
                          for n, v in supp.items()), key=lambda s: -s["amount"]),
        invoices=invoices, liabilities=liab, staff=staff, operations=ops[:25], warnings=warn,
    )



# ---------------------------------------------------------------- Bitrix24

def bx_call(method, params=()):
    """Все страницы метода Bitrix24 REST одним списком."""
    out, start = [], 0
    while True:
        q = urllib.parse.urlencode(list(params) + [("start", start)])
        for attempt in range(4):
            try:
                with urllib.request.urlopen(f"{BITRIX}/{method}.json?{q}", timeout=60) as r:
                    d = json.loads(r.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as e:
                if e.code not in (429, 503) or attempt == 3:
                    raise RuntimeError(f"{method}: HTTP {e.code}") from None   # без адреса: в нём ключ
                time.sleep(2 + attempt * 2)
            except urllib.error.URLError as e:
                raise RuntimeError(f"{method}: {e.reason}") from None
        res = d.get("result")
        if isinstance(res, dict):
            res = next((v for v in res.values() if isinstance(v, list)), [])
        out += res or []
        if "next" not in d:
            return out
        start = d["next"]
        time.sleep(0.35)          # лимит Bitrix24: 2 запроса в секунду


def bx_mirror():
    raw = dict(
        deals=bx_call("crm.deal.list", [("select[]", "*"), ("select[]", "UF_*"), ("order[ID]", "ASC")]),
        statuses=bx_call("crm.status.list"),
        categories=bx_call("crm.category.list", [("entityTypeId", 2)]),
        users=bx_call("user.get"),
        activities=bx_call("crm.activity.list", [("order[ID]", "ASC")]),
        contacts=bx_call("crm.contact.list", [("select[]", "*"), ("select[]", "PHONE"), ("select[]", "EMAIL"), ("order[ID]", "ASC")]),
        companies=bx_call("crm.company.list", [("order[ID]", "ASC")]),
        leads=bx_call("crm.lead.list", [("order[ID]", "ASC")]),
    )
    day_dir = os.path.join(DATA_DIR, "raw", dt.date.today().isoformat())
    os.makedirs(day_dir, exist_ok=True)
    for k, rows in raw.items():
        save_raw(day_dir, "Bitrix24_" + k, rows)
    print("bitrix:", {k: len(v) for k, v in raw.items()})
    return raw


def bx_time(s):
    return dt.datetime.fromisoformat(s).astimezone(TZ) if s else None


def bx_build(raw):
    deals = raw["deals"]
    cats = {str(c["id"]): c["name"] for c in raw["categories"]} or {"0": "Сделки"}
    stage_ent = lambda cid: "DEAL_STAGE" if str(cid) == "0" else f"DEAL_STAGE_{cid}"
    stages = defaultdict(list)
    for st in raw["statuses"]:
        if st["ENTITY_ID"].startswith("DEAL_STAGE"):
            stages[st["ENTITY_ID"]].append(st)
    sources = {st["STATUS_ID"]: st["NAME"] for st in raw["statuses"] if st["ENTITY_ID"] == "SOURCE"}
    users = {}
    for u in raw["users"]:
        nm = " ".join(x for x in (u.get("NAME"), u.get("LAST_NAME")) if x).strip()
        users[str(u["ID"])] = nm or (u.get("EMAIL") or "").split("@")[0] or f"Сотрудник {u['ID']}"
    stage_name = {st["STATUS_ID"]: st["NAME"] for lst in stages.values() for st in lst}
    amt = lambda x: float(x.get("OPPORTUNITY") or 0)
    sem = lambda x: {"S": "won", "F": "lost"}.get(x.get("STAGE_SEMANTIC_ID"), "open")

    now = dt.datetime.now(TZ)
    today = now.date()
    created = [(bx_time(x["DATE_CREATE"]), x) for x in deals]
    first = min((c.date() for c, _ in created), default=today)
    start = max(first, today - dt.timedelta(days=29))
    days = [(start + dt.timedelta(days=i)).isoformat() for i in range((today - start).days + 1)]
    cat_ids = sorted(cats, key=int)
    by_day = {cid: defaultdict(int) for cid in cat_ids}
    for c, x in created:
        by_day.setdefault(str(x.get("CATEGORY_ID") or "0"), defaultdict(int))[c.date().isoformat()] += 1

    funnels = []
    for cid in cat_ids:
        ds = [x for x in deals if str(x.get("CATEGORY_ID") or "0") == cid]
        cnt, sm = defaultdict(int), defaultdict(float)
        for x in ds:
            cnt[x["STAGE_ID"]] += 1
            sm[x["STAGE_ID"]] += amt(x)
        rows = [dict(name=st["NAME"], count=cnt.get(st["STATUS_ID"], 0), amount=round(sm.get(st["STATUS_ID"], 0)),
                     kind={"S": "won", "F": "lost"}.get(st.get("SEMANTICS"), "open"))
                for st in sorted(stages.get(stage_ent(cid), []), key=lambda s: int(s.get("SORT") or 0))]
        rows = [r for r in rows if r["count"] or r["kind"] != "lost"]
        funnels.append(dict(name=cats[cid], total=len(ds), open=sum(sem(x) == "open" for x in ds),
                            won=sum(sem(x) == "won" for x in ds), lost=sum(sem(x) == "lost" for x in ds),
                            won_amount=round(sum(amt(x) for x in ds if sem(x) == "won")), stages=rows,
                            daily=[by_day[cid].get(d, 0) for d in days]))

    mgr = defaultdict(lambda: dict(total=0, open=0, won=0, lost=0, won_amount=0.0))
    src = defaultdict(int)
    chan = defaultdict(int)
    for x in deals:
        m = mgr[users.get(str(x.get("ASSIGNED_BY_ID")), f"Сотрудник {x.get('ASSIGNED_BY_ID')}")]
        m["total"] += 1
        m[sem(x)] += 1
        if sem(x) == "won": m["won_amount"] += amt(x)
        chan[(x.get("UTM_SOURCE") or "").strip() or "без метки"] += 1
        src[sources.get(x.get("SOURCE_ID"), "") or "Не указан"] += 1

    acts = raw["activities"]
    open_acts = [a for a in acts if a.get("COMPLETED") != "Y"]
    overdue = sum(1 for a in open_acts if a.get("DEADLINE") and bx_time(a["DEADLINE"]) < now
                  and not a["DEADLINE"].startswith("9999"))
    won = [x for x in deals if sem(x) == "won"]
    lost = [x for x in deals if sem(x) == "lost"]
    week_ago = today - dt.timedelta(days=6)
    recent = sorted(created, key=lambda cx: cx[0], reverse=True)[:30]
    return dict(
        portal=urllib.parse.urlparse(BITRIX).hostname, days=days,
        kpi=dict(total=len(deals), open=len(deals) - len(won) - len(lost), won=len(won), lost=len(lost),
                 won_amount=round(sum(map(amt, won))), open_amount=round(sum(amt(x) for x in deals if sem(x) == "open")),
                 avg_check=round(sum(map(amt, won)) / max(1, sum(1 for x in won if amt(x) > 0))),
                 today=sum(1 for c, _ in created if c.date() == today),
                 week=sum(1 for c, _ in created if c.date() >= week_ago),
                 contacts=len(raw["contacts"]), companies=len(raw["companies"]), leads=len(raw["leads"]),
                 activities_open=len(open_acts), activities_overdue=overdue,
                 conversion=(len(won) / len(deals)) if deals else None),
        funnels=funnels,
        managers=sorted(({"name": n, **{k: round(v) for k, v in m.items()}} for n, m in mgr.items()), key=lambda m: -m["total"]),
        channels=[dict(name=n, count=c) for n, c in sorted(chan.items(), key=lambda kv: -kv[1])],
        sources=[dict(name=n, count=c) for n, c in sorted(src.items(), key=lambda kv: -kv[1])],
        recent=[dict(date=c.strftime("%Y-%m-%d %H:%M"), title=x.get("TITLE") or "", funnel=cats.get(str(x.get("CATEGORY_ID") or "0"), ""),
                     stage=stage_name.get(x["STAGE_ID"], x["STAGE_ID"]), kind=sem(x), amount=round(amt(x)),
                     manager=users.get(str(x.get("ASSIGNED_BY_ID")), "")) for c, x in recent],
    )


def bitrix_block():
    """Раздел Bitrix24 для data.json. Ошибка Bitrix не должна ломать выгрузку 1С."""
    if not BITRIX:
        return None
    try:
        return bx_build(bx_mirror())
    except Exception as e:  # noqa
        print("bitrix: ошибка —", e)
        return dict(error=str(e)[:200])



# ---------------------------------------------------------------- другие сервисы
# Каждый сервис включается сам, как только в /etc/airl-1c-hub/env появляются его ключи
# (команда на сервере: airl-hub set ИМЯ значение). Нет ключей — сервис «не подключён».

def http_json(url, headers=None, label=""):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        try:
            j = json.loads(body)
            msg = (j.get("error") or {}).get("message") if isinstance(j.get("error"), dict) else j.get("description") or j.get("message")
        except Exception:  # noqa
            msg = None
        raise RuntimeError(f"{label}: {msg or 'HTTP ' + str(e.code)}") from None   # без адреса: в нём ключ
    except urllib.error.URLError as e:
        raise RuntimeError(f"{label}: {e.reason}") from None


def env(*names):
    vals = [os.environ.get(n, "").strip() for n in names]
    return vals if all(vals) else None


def svc_meta_ads():
    """Реклама Facebook / Instagram: расход, показы, клики по дням за 30 дней."""
    token, account = env("META_ADS_TOKEN", "META_AD_ACCOUNT")
    if not account.startswith("act_"):
        account = "act_" + account
    q = urllib.parse.urlencode(dict(fields="spend,impressions,clicks,account_currency", time_increment=1,
                                    date_preset="last_30d", limit=100, access_token=token))
    rows = http_json(f"https://graph.facebook.com/v21.0/{account}/insights?{q}", label="Meta Ads").get("data", [])
    days = [dict(date=r["date_start"], spend=float(r.get("spend") or 0), impressions=int(r.get("impressions") or 0),
                 clicks=int(r.get("clicks") or 0)) for r in rows]
    spend, clicks, imp = sum(d["spend"] for d in days), sum(d["clicks"] for d in days), sum(d["impressions"] for d in days)
    return dict(currency=(rows[0].get("account_currency") if rows else "") or "", days=days, spend=round(spend, 2),
                clicks=clicks, impressions=imp, cpc=(spend / clicks) if clicks else None, ctr=(clicks / imp) if imp else None)


def svc_metrika():
    """Яндекс.Метрика: визиты и посетители по дням, источники трафика за 30 дней."""
    token, counter = env("YANDEX_METRIKA_TOKEN", "YANDEX_METRIKA_COUNTER")
    h = {"Authorization": "OAuth " + token}
    base = "https://api-metrika.yandex.net/stat/v1/data?" + urllib.parse.urlencode(dict(ids=counter, date1="30daysAgo", date2="today", limit=100))
    by_day = http_json(base + "&metrics=ym:s:visits,ym:s:users,ym:s:pageviews&dimensions=ym:s:date&sort=ym:s:date", h, "Яндекс.Метрика")
    by_src = http_json(base + "&metrics=ym:s:visits&dimensions=ym:s:lastTrafficSource&sort=-ym:s:visits", h, "Яндекс.Метрика")
    days = [dict(date=r["dimensions"][0]["name"], visits=int(r["metrics"][0]), users=int(r["metrics"][1]),
                 pageviews=int(r["metrics"][2])) for r in by_day.get("data", [])]
    tot = by_day.get("totals") or [0, 0, 0]
    return dict(days=days, visits=int(tot[0]), users=int(tot[1]), pageviews=int(tot[2]),
                sources=[dict(name=r["dimensions"][0]["name"], count=int(r["metrics"][0])) for r in by_src.get("data", [])])


def svc_telegram():
    """Telegram-канал: число подписчиков (бот должен быть администратором канала)."""
    token, chat = env("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT")
    q = urllib.parse.urlencode(dict(chat_id=chat))
    info = http_json(f"https://api.telegram.org/bot{token}/getChat?{q}", label="Telegram")["result"]
    n = http_json(f"https://api.telegram.org/bot{token}/getChatMemberCount?{q}", label="Telegram")["result"]
    hist_path = os.path.join(DATA_DIR, "telegram_history.json")     # своя история: Telegram прошлые значения не отдаёт
    try:
        hist = json.load(open(hist_path, encoding="utf-8"))
    except Exception:  # noqa
        hist = {}
    hist[dt.datetime.now(TZ).date().isoformat()] = n
    hist = dict(sorted(hist.items())[-180:])
    os.makedirs(DATA_DIR, exist_ok=True)
    json.dump(hist, open(hist_path, "w", encoding="utf-8"))
    return dict(title=info.get("title") or chat, username=info.get("username") or "", members=n,
                history=[dict(date=d, members=v) for d, v in hist.items()])


SERVICES = [
    # id, название, раздел, что показывает, нужные ключи, функция
    ("onec", "1С:Бухгалтерия", "Финансы", "Деньги, выручка, расходы, долги, счета, команда", ["ODATA_URL", "ODATA_USER", "ODATA_PASS"], None),
    ("bitrix", "Bitrix24", "Продажи", "Сделки, воронки, менеджеры, источники заявок", ["BITRIX_WEBHOOK"], None),
    ("meta_ads", "Реклама Facebook / Instagram", "Маркетинг", "Расход на рекламу, показы, клики, цена клика", ["META_ADS_TOKEN", "META_AD_ACCOUNT"], svc_meta_ads),
    ("metrika", "Яндекс.Метрика", "Маркетинг", "Посещаемость сайта и источники трафика", ["YANDEX_METRIKA_TOKEN", "YANDEX_METRIKA_COUNTER"], svc_metrika),
    ("telegram", "Telegram-канал", "Маркетинг", "Подписчики канала и их динамика", ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT"], svc_telegram),
]


def run_services(out, old):
    """Заполняет out[<id>] по подключённым сервисам и out['services'] — их состояние."""
    now = out["generated_at"]
    state = []
    for sid, name, group, what, keys, fn in SERVICES:
        item = dict(id=sid, name=name, group=group, what=what, keys=keys)
        have = [k for k in keys if os.environ.get(k, "").strip()]
        if sid == "onec":
            item.update(status="ok", updated=now)
        elif len(have) < len(keys):
            item.update(status="off", missing=[k for k in keys if k not in have])
        elif sid == "bitrix":
            b = out.get("bitrix") or {}
            item.update(status="error" if ("error" in b or b.get("stale")) else "ok",
                        error=b.get("error") or ("нет связи, показаны прошлые данные" if b.get("stale") else None), updated=now)
        else:
            try:
                out[sid] = fn()
                item.update(status="ok", updated=now)
                print(f"{sid}: ok")
            except Exception as e:  # noqa
                print(f"{sid}: ошибка —", e)
                item.update(status="error", error=str(e)[:200])
                if old.get(sid):                      # оставляем прошлые данные
                    out[sid] = dict(old[sid], stale=True)
        state.append(item)
    out["services"] = state


def main():
    if not (URL and USER and PASS):
        raise SystemExit("Задайте ODATA_URL, ODATA_USER, ODATA_PASS")
    data, missing = mirror("--full" in sys.argv)
    if "AccountingRegister_Типовой" not in data or "ChartOfAccounts_Типовой" not in data:
        raise SystemExit("1С недоступна или нет прав на регистр бухгалтерии; data.json не обновлён")
    out = build(data)
    try:
        old = json.load(open(os.path.join(WEB_DIR, "data.json"), encoding="utf-8"))
    except Exception:  # noqa
        old = {}
    bx = bitrix_block()
    if bx is not None:
        if "error" in bx and old.get("bitrix") and "error" not in old["bitrix"]:
            bx = dict(old["bitrix"], stale=True)      # Bitrix недоступен — оставляем прошлые данные
        out["bitrix"] = bx
    run_services(out, old)
    os.makedirs(WEB_DIR, exist_ok=True)
    tmp = os.path.join(WEB_DIR, "data.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    os.replace(tmp, os.path.join(WEB_DIR, "data.json"))
    print("data.json обновлён:", out["generated_at"], "| данные по", out["data_through"])


if __name__ == "__main__":
    main()
