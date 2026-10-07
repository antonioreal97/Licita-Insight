#!/usr/bin/env python3
"""Monitor do servidor do Abriu lá, sem LLM.

  check   (timer, 5 min): coleta métricas, detecta anomalias novas e acorda o Albert-CLAUDE
          com um prompt curto apontando para o arquivo do alerta.
  deploy  (timer, 10 min): git fetch da branch ops/macbook-worker; havendo commits novos, aciona o Albert-CLAUDE
          para puxar e aplicar (seção "Atualização da branch" do ALBERT.md).
  delegate envia uma tarefa ao Albert-CLAUDE ou, se ele estiver sem cota do Claude, ao Codex do servidor
          (codex exec numa unit systemd, sem terminal) via handoff; o check devolve ao Albert para validar.
  digest  (timer, diário): publica o relatório diário na issue de monitoramento, sem LLM.
  status  imprime as métricas atuais em JSON.

Configuração em ~/licita-monitor/config.env (chave=valor). Runbook do agente: ~/licita-monitor/ALBERT.md.
"""
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
BASE = HOME / "licita-monitor"
STATE = BASE / "state"
ALERTS = BASE / "alerts"
REPORTS = BASE / "reports"


def load_config():
    cfg = {
        "REPO_DIR": str(HOME / "Documentos/LICITA/Licita-Insight"),
        "COMPOSE_FILE": "compose.macbook.yml",
        "APP_CONTAINER": "licita-macbook-app-1",
        "PG_CONTAINER": "licita-macbook-postgres-1",
        "PUBLIC_URL": "https://abriu-la.vercel.app",
        "EDGE_URL": "",
        "GITHUB_REPO": "antonioreal97/Licita-Insight",
        "MONITOR_ISSUE": "",
        "ORCA_CLI": str(HOME / ".config/orca/linux-orca-cli-shim/orca"),
        "ALBERT_TERMINAL": "",
        "AI_DAILY_BUDGET_USD": "10",
        "MAX_WAKES_PER_DAY": "6",
        "REALERT_HOURS": "6",
    }
    path = BASE / "config.env"
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip()
    return cfg


CFG = load_config()


def run(cmd, timeout=60, check=False):
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if check and p.returncode != 0:
        raise RuntimeError(f"{cmd[0]} falhou: {p.stderr.strip()[:300]}")
    return p


def sql(query):
    p = run(["docker", "exec", CFG["PG_CONTAINER"], "psql", "-U", "licita", "-d", "licita", "-Atc", query], check=True)
    return p.stdout.strip()


def sql_json(query):
    out = sql(f"select coalesce(json_agg(t), '[]') from ({query}) t")
    return json.loads(out or "[]")


def http_ok(url, headers=()):
    args = ["curl", "-fsS", "--max-time", "15", "-o", "/dev/null", "-w", "%{http_code}"]
    for h in headers:
        args += ["-H", h]
    p = run(args + [url], timeout=20)
    return p.returncode == 0, p.stdout.strip() or p.stderr.strip()[:120]


# ---------------------------------------------------------------- coleta

def collect():
    m = {"at": dt.datetime.now().astimezone().isoformat(timespec="seconds")}

    m["users"] = sql_json("""
      select (select count(*) from users) total,
             (select count(*) from users where created_at > now() - interval '24 hours') new_24h,
             (select count(*) from users where created_at > now() - interval '7 days') new_7d,
             (select count(distinct user_id) from sessions where last_seen_at > now() - interval '24 hours') active_24h,
             (select count(*) from users where trial_ends_at > now()) in_trial,
             (select coalesce(json_object_agg(status, n), '{}') from (select status, count(*) n from subscriptions group by 1) s) subscriptions
    """)[0]

    m["ai"] = sql_json("""
      select (select count(*) from ai_title_usage where created_at >= date_trunc('day', now())) titles_today,
             (select coalesce(sum(estimated_cost_usd), 0) from ai_title_usage where created_at >= date_trunc('day', now())) titles_cost_today,
             (select count(*) from ai_ask_requests where created_at >= date_trunc('day', now())) asks_today,
             (select coalesce(sum(coalesce(estimated_cost_usd,0) + coalesce(summary_estimated_cost_usd,0)), 0)
                from ai_ask_requests where created_at >= date_trunc('day', now())) asks_cost_today,
             (select count(*) from tender_ai_sheets where generated_at >= date_trunc('day', now())) sheets_today,
             (select coalesce(sum(coalesce(estimated_cost_usd,0) + coalesce(summary_estimated_cost_usd,0)), 0)
                from tender_ai_sheets where generated_at >= date_trunc('day', now())) sheets_cost_today,
             (select count(*) from tender_ai_sheets where generated_at > now() - interval '24 hours') sheets_24h,
             (select count(*) from ai_jobs where status in ('queued', 'pending')) jobs_queued,
             (select count(*) from ai_jobs where status = 'failed' and coalesce(finished_at, created_at) > now() - interval '1 hour') jobs_failed_1h
    """)[0]
    m["ai"]["cost_today_usd"] = round(sum(float(m["ai"][k]) for k in ("titles_cost_today", "asks_cost_today", "sheets_cost_today")), 4)

    m["emails"] = sql_json("""
      select (select count(*) from email_deliveries where sent_at > now() - interval '24 hours') sent_24h,
             (select count(*) from email_deliveries where status = 'failed' and updated_at > now() - interval '24 hours') failed_24h
    """)[0]

    m["ingest"] = sql_json("""
      select distinct on (source) source, status, started_at, finished_at, heartbeat_at, pages_read, upserted, error,
             extract(epoch from now() - coalesce(heartbeat_at, started_at))::int heartbeat_age_s
        from ingest_runs order by source, started_at desc
    """)
    m["ingest_running"] = sql_json("""
      select source, started_at, heartbeat_at, extract(epoch from now() - coalesce(heartbeat_at, started_at))::int heartbeat_age_s
        from ingest_runs where status = 'running'
    """)
    m["ingest_last_success"] = sql_json("""
      select source, max(finished_at) finished_at, extract(epoch from now() - max(finished_at))::int age_s
        from ingest_runs where status in ('succeeded', 'complete') group by 1
    """)
    m["counts"] = sql_json("select (select count(*) from tenders) tenders, (select count(*) from pncp_contracts) contracts")[0]

    # HTTP: logs do pino-http do app
    http = {"window": "24h", "requests": 0, "s2xx": 0, "s3xx": 0, "s4xx": 0, "s5xx": 0, "s5xx_10m": 0, "p95_ms": None}
    times = []
    cutoff_10m = (dt.datetime.now().timestamp() - 600) * 1000
    logs = run(["docker", "logs", "--since", "24h", CFG["APP_CONTAINER"]], timeout=120)
    for line in (logs.stdout + logs.stderr).splitlines():
        if '"request completed"' not in line:
            continue
        try:
            o = json.loads(line)
        except ValueError:
            continue
        code = (o.get("res") or {}).get("statusCode", 0)
        http["requests"] += 1
        http[f"s{code // 100}xx"] = http.get(f"s{code // 100}xx", 0) + 1
        if code >= 500 and o.get("time", 0) >= cutoff_10m:
            http["s5xx_10m"] += 1
        if isinstance(o.get("responseTime"), (int, float)):
            times.append(o["responseTime"])
    if times:
        times.sort()
        http["p95_ms"] = times[int(len(times) * 0.95) - 1 if len(times) > 1 else 0]
    m["http"] = http

    # Infra
    infra = {}
    for name in (CFG["APP_CONTAINER"], CFG["PG_CONTAINER"]):
        p = run(["docker", "inspect", name, "--format", "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.RestartCount}}|{{.State.StartedAt}}"])
        status, health, restarts, started = (p.stdout.strip().split("|") + ["", "", "", ""])[:4] if p.returncode == 0 else ("missing", "", "0", "")
        infra[name] = {"status": status, "health": health, "restarts": int(restarts or 0), "started_at": started}
    du = shutil.disk_usage("/")
    infra["disk_used_pct"] = round(du.used / du.total * 100, 1)
    meminfo = dict(l.split(":", 1) for l in Path("/proc/meminfo").read_text().splitlines())
    kb = lambda k: int(meminfo[k].split()[0])
    infra["mem_available_mb"] = kb("MemAvailable") // 1024
    infra["swap_used_mb"] = (kb("SwapTotal") - kb("SwapFree")) // 1024
    infra["load_1m"] = os.getloadavg()[0]
    m["infra"] = infra

    # Rede
    net = {}
    net["local_readyz"] = http_ok("http://127.0.0.1:24252/api/readyz")
    p = run(["curl", "-fsS", "--max-time", "5", "http://127.0.0.1:4040/api/tunnels"])
    try:
        net["ngrok_url"] = next(t["public_url"] for t in json.loads(p.stdout)["tunnels"] if t.get("proto") == "https")
    except (ValueError, StopIteration, KeyError):
        net["ngrok_url"] = None
    net["public_readyz"] = http_ok(CFG["PUBLIC_URL"] + "/api/readyz")
    if CFG["EDGE_URL"]:
        net["edge_readyz"] = http_ok(CFG["EDGE_URL"].rstrip("/") + "/api/readyz")
        net["vercel_sync_result"] = ""
    else:
        p = run(["systemctl", "--user", "show", "licita-ngrok-vercel-sync.service", "-p", "Result", "--value"])
        net["vercel_sync_result"] = p.stdout.strip()
    m["net"] = net
    return m


# ---------------------------------------------------------------- anomalias

def anomalies(m, prev):
    found = []

    def add(key, severity, text):
        found.append({"key": key, "severity": severity, "text": text})

    for name in (CFG["APP_CONTAINER"], CFG["PG_CONTAINER"]):
        c = m["infra"][name]
        if c["status"] != "running" or c["health"] not in ("healthy", ""):
            add(f"container:{name}:{c['status']}:{c['health']}", "critica", f"{name} está {c['status']}/{c['health'] or 'sem healthcheck'}")
        before = (prev.get("infra", {}).get(name) or {}).get("restarts")
        if before is not None and c["restarts"] > before:
            add(f"restart:{name}:{c['restarts']}", "alta", f"{name} reiniciou ({before} → {c['restarts']})")
    if not m["net"]["local_readyz"][0]:
        add("readyz:local", "critica", f"/api/readyz local falhou ({m['net']['local_readyz'][1]})")
    if CFG["EDGE_URL"]:
        if not m["net"]["edge_readyz"][0]:
            add("edge:down", "critica", f"{CFG['EDGE_URL']}/api/readyz falhou ({m['net']['edge_readyz'][1]})")
    elif not m["net"]["ngrok_url"]:
        add("ngrok:down", "critica", "ngrok sem túnel https ativo")
    if not m["net"]["public_readyz"][0]:
        add("readyz:public", "critica", f"{CFG['PUBLIC_URL']}/api/readyz falhou ({m['net']['public_readyz'][1]})")
    if not CFG["EDGE_URL"] and m["net"]["vercel_sync_result"] not in ("success", ""):
        add(f"vercel-sync:{m['net']['vercel_sync_result']}", "alta", f"sincronização ngrok→Vercel com resultado {m['net']['vercel_sync_result']}")
    if m["infra"]["disk_used_pct"] >= 85:
        add("disk:85", "alta", f"disco em {m['infra']['disk_used_pct']}%")
    if m["infra"]["mem_available_mb"] < 400:
        add("mem:low", "media", f"memória disponível {m['infra']['mem_available_mb']} MB")
    if m["http"]["s5xx_10m"] >= 5:
        add("http:5xx", "alta", f"{m['http']['s5xx_10m']} respostas 5xx nos últimos 10 min")
    for r in m["ingest_running"]:
        if r["heartbeat_age_s"] > 1800:
            add(f"ingest:stuck:{r['source']}:{r['started_at']}", "alta",
                f"coleta {r['source']} em running sem heartbeat há {r['heartbeat_age_s'] // 60} min (início {r['started_at']})")
    last_ok = {r["source"]: r for r in m["ingest_last_success"]}
    for source, limit_h in (("pncp", 26), ("pncp-transparency", 26)):
        age = (last_ok.get(source) or {}).get("age_s")
        if age is None or age > limit_h * 3600:
            add(f"ingest:stale:{source}", "alta", f"nenhuma coleta {source} bem-sucedida nas últimas {limit_h} h")
    for r in m["ingest"]:
        if r["status"] == "failed" and r.get("finished_at"):
            add(f"ingest:failed:{r['source']}:{r['started_at']}", "media", f"última coleta {r['source']} falhou: {(r.get('error') or '')[:160]}")
    if m["ai"]["jobs_failed_1h"] >= 5:
        add("ai:jobs-failed", "media", f"{m['ai']['jobs_failed_1h']} jobs de IA falharam na última hora")
    if m["ai"]["jobs_queued"] > 500:
        add("ai:queue", "media", f"fila de IA com {m['ai']['jobs_queued']} jobs")
    budget = float(CFG["AI_DAILY_BUDGET_USD"])
    if m["ai"]["cost_today_usd"] >= 0.8 * budget:
        add("ai:budget80", "media", f"custo de IA hoje US$ {m['ai']['cost_today_usd']:.2f} (≥ 80% de US$ {budget:.0f})")
    return found


# ---------------------------------------------------------------- Albert

def albert_terminal():
    orca = CFG["ORCA_CLI"]
    p = run([orca, "terminal", "list", "--json"], timeout=30)
    try:
        terms = json.loads(p.stdout)["result"]["terminals"]
    except (ValueError, KeyError):
        return None
    handles = {t["handle"]: t for t in terms}
    if CFG["ALBERT_TERMINAL"] in handles:
        return CFG["ALBERT_TERMINAL"]
    named = [t["handle"] for t in terms if "albert" in (t.get("title") or "").lower()]
    claude = [t["handle"] for t in terms if t.get("agentIdentity") == "claude"]
    pick = (named or claude or [None])[0]
    return pick


# Repasse ao Codex quando o Albert-CLAUDE fica sem cota do Claude (janela de 5 h).
# Handoff: ~/licita-monitor/handoff/<data>.md com a tarefa, o que já foi feito e "## O que falta". O Codex trabalha
# só no "O que falta", escreve "## Resultado do Codex" e o monitor devolve ao Albert-CLAUDE para validar.
HANDOFF = BASE / "handoff"
LIMIT_FLAG = STATE / "albert-limited.json"
LIMIT_PATTERNS = re.compile(
    r"usage limit|session limit|5-hour limit|weekly limit|limit reached|limit will reset|"
    r"resets? (at|in) \d|approaching .{0,40}limit|limite de uso",
    re.IGNORECASE,
)


def send_to_albert(handle, prompt):
    p = run([CFG["ORCA_CLI"], "terminal", "send", "--terminal", handle, "--text", prompt, "--enter", "--json"], timeout=60)
    return p.returncode == 0, (p.stdout + p.stderr)[-300:]


def albert_limited(handle):
    """True enquanto o Albert-CLAUDE estiver sem cota: sinal gravado por ele ou aviso de limite na tela."""
    now = dt.datetime.now().timestamp()
    if LIMIT_FLAG.exists():
        try:
            if json.loads(LIMIT_FLAG.read_text()).get("until", 0) > now:
                return True
        except ValueError:
            pass
    if not handle:
        return False
    p = run([CFG["ORCA_CLI"], "terminal", "read", "--terminal", handle, "--screen", "--json"], timeout=30)
    try:
        tail = "\n".join(json.loads(p.stdout)["result"]["terminal"]["tail"][-40:])
    except (ValueError, KeyError):
        return False
    match = LIMIT_PATTERNS.search(tail)
    if match:
        LIMIT_FLAG.write_text(json.dumps({"until": now + 3600, "reason": f"tela: {match.group(0)}"}))
        return True
    return False


def codex_running():
    p = run(["systemctl", "--user", "list-units", "licita-codex-*", "--state=active", "--no-legend"])
    return bool(p.stdout.strip())


def new_handoff(task):
    """Handoff para uma tarefa que o Albert-CLAUDE nem começou: o que falta é a tarefa inteira."""
    HANDOFF.mkdir(parents=True, exist_ok=True)
    path = HANDOFF / f"{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.md"
    path.write_text(f"# Handoff do monitor\n\n## Tarefa\n{task}\n\n## O que já foi feito\nNada (o Albert-CLAUDE "
                    f"estava sem cota quando a tarefa chegou).\n\n## O que falta\nA tarefa inteira acima.\n")
    return path


def run_codex(handoff):
    """Executa o Codex sem terminal (unit systemd transitória) só no "O que falta" do handoff."""
    stamp = handoff.stem
    out, log = REPORTS / f"codex-{stamp}.md", REPORTS / f"codex-{stamp}.log"
    prompt = (
        "Você é o Codex do servidor do Abriu lá e está substituindo o Albert-CLAUDE, que ficou sem cota de uso do "
        f"Claude. Contexto: leia ~/licita-monitor/ALBERT.md (runbook e limites, valem para você), {handoff} e "
        f"memory-bank/activeContext.md no clone {CFG['REPO_DIR']}. Trabalhe SOMENTE no que está em '## O que falta' "
        "do handoff; não refaça o que já foi feito nem comece tarefas novas. Ao terminar, acrescente ao handoff a "
        "seção '## Resultado do Codex' (o que fez, comandos e verificações, o que não conseguiu) e comente um resumo "
        "na issue de monitoramento com o título começando por 'via Codex — aguardando validação do Albert-CLAUDE'. "
        "Commits seguem as regras do runbook (sem trailers de coautoria e sem citar agentes)."
    )
    script = (f'codex exec --dangerously-bypass-approvals-and-sandbox -C "{CFG["REPO_DIR"]}" '
              f'-o "{out}" "$(cat "{handoff}.prompt")" > "{log}" 2>&1')
    Path(f"{handoff}.prompt").write_text(prompt)
    p = run(["systemd-run", "--user", f"--unit=licita-codex-{stamp}", "--collect", "bash", "-lc", script], timeout=30)
    if p.returncode != 0:
        return False, (p.stdout + p.stderr)[-300:]
    Path(f"{handoff}.codex").write_text(json.dumps({"unit": f"licita-codex-{stamp}", "started": stamp}))
    return True, f"Codex iniciado (licita-codex-{stamp}); handoff {handoff}"


def delegate(task, handoff=None):
    """Envia ao Albert-CLAUDE; sem cota, repassa ao Codex com handoff (ou enfileira se o Codex estiver ocupado)."""
    handle = albert_terminal()
    if not albert_limited(handle):
        if not handle:
            return False, "terminal do Albert-CLAUDE não encontrado"
        ok, info = send_to_albert(handle, task)
        return ok, "[via Albert-CLAUDE] " + info
    handoff = Path(handoff) if handoff else new_handoff(task)
    if codex_running():
        Path(f"{handoff}.queued").touch()
        return True, f"[fila] Codex ocupado; handoff {handoff} enfileirado"
    ok, info = run_codex(handoff)
    return ok, "[via Codex] " + info


def handoffs_tick():
    """Despacha handoffs enfileirados e devolve ao Albert-CLAUDE os concluídos pelo Codex quando a cota voltar."""
    if not HANDOFF.exists():
        return
    busy = codex_running()
    for queued in sorted(HANDOFF.glob("*.md.queued")):
        if busy:
            break
        handoff = Path(str(queued)[: -len(".queued")])
        queued.unlink()
        busy = run_codex(handoff)[0]
    pending = [Path(str(c)[: -len(".codex")]) for c in sorted(HANDOFF.glob("*.md.codex"))]
    if busy or not pending:
        return
    handle = albert_terminal()
    if not handle or albert_limited(handle):
        return
    for handoff in pending:
        prompt = (f"[validação] O Codex trabalhou no handoff {handoff} enquanto você estava sem cota. Valide o "
                  "'## Resultado do Codex' contra o '## O que falta' (confira os comandos e o estado real), corrija só "
                  "o que estiver dentro do escopo do handoff, comente a validação na issue de monitoramento e mova o "
                  f"handoff para {HANDOFF / 'done'}/.")
        if send_to_albert(handle, prompt)[0]:
            Path(f"{handoff}.codex").rename(f"{handoff}.validating")


def wake_albert(alert_path, alerts):
    resumo = "; ".join(a["text"] for a in alerts)[:300]
    prompt = (f"[monitor] Anomalia no servidor: {resumo}. Siga ~/licita-monitor/ALBERT.md "
              f"para o alerta {alert_path} e publique o relatório.")
    return delegate(prompt)


def cmd_check():
    for d in (STATE, ALERTS, REPORTS):
        d.mkdir(parents=True, exist_ok=True)
    handoffs_tick()
    prev_path = STATE / "last-metrics.json"
    prev = json.loads(prev_path.read_text()) if prev_path.exists() else {}
    m = collect()
    found = anomalies(m, prev)
    prev_path.write_text(json.dumps(m, default=str, indent=1))

    seen_path = STATE / "seen.json"
    seen = json.loads(seen_path.read_text()) if seen_path.exists() else {}
    now = dt.datetime.now().timestamp()
    realert = float(CFG["REALERT_HOURS"]) * 3600
    new = [a for a in found if now - seen.get(a["key"], 0) > realert]
    for a in found:
        seen.setdefault(a["key"], 0)
    if not new:
        seen = {k: v for k, v in seen.items() if any(a["key"] == k for a in found) or now - v < realert}
        seen_path.write_text(json.dumps(seen))
        print(f"ok: {len(found)} anomalia(s) já notificada(s), 0 nova(s)")
        return

    today = dt.date.today().isoformat()
    wakes_path = STATE / "wakes.json"
    wakes = json.loads(wakes_path.read_text()) if wakes_path.exists() else {}
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    alert_path = ALERTS / f"{stamp}.json"
    alert_path.write_text(json.dumps({"anomalies": new, "all_active": found, "metrics": m}, default=str, indent=1))
    for a in new:
        seen[a["key"]] = now
    seen_path.write_text(json.dumps(seen))

    if wakes.get(today, 0) >= int(CFG["MAX_WAKES_PER_DAY"]):
        print(f"limite diário de acionamentos atingido; alerta salvo em {alert_path}")
        return
    ok, info = wake_albert(alert_path, new)
    if ok:
        wakes[today] = wakes.get(today, 0) + 1
        wakes_path.write_text(json.dumps({today: wakes[today]}))
    print((info if ok else f"falha ao acionar o agente: {info}") + f" para {alert_path}")


# ---------------------------------------------------------------- heartbeat de deploy

BRANCH = "ops/macbook-worker"


def git(*args, timeout=60):
    return run(["git", "-C", CFG["REPO_DIR"], *args], timeout=timeout)


def classify(paths):
    kinds = set()
    for f in paths:
        if f.startswith(("lib/db/migrations/", "lib/db/src/schema/")):
            kinds.add("db_schema")
        elif f.startswith("ops/macbook/"):
            kinds.add("monitor_ops")
        elif f.startswith(("compose.macbook", "Dockerfile")):
            kinds.add("app_build")
        elif f.startswith(("artifacts/", "lib/", "scripts/")) or f in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"):
            kinds.add("app_build")
        else:
            kinds.add("docs")
    return sorted(kinds)


def cmd_deploy():
    for d in (STATE, ALERTS):
        d.mkdir(parents=True, exist_ok=True)
    fetch = git("fetch", "-q", "origin", BRANCH, timeout=120)
    if fetch.returncode != 0:
        print(f"git fetch falhou: {fetch.stderr.strip()[:200]}")
        sys.exit(1)
    head = git("rev-parse", "HEAD").stdout.strip()
    remote = git("rev-parse", f"origin/{BRANCH}").stdout.strip()
    if head == remote:
        print("ok: clone em dia com origin")
        return
    behind = git("merge-base", "--is-ancestor", "HEAD", f"origin/{BRANCH}").returncode == 0
    commits = git("log", "--format=%h %s", f"HEAD..origin/{BRANCH}").stdout.strip().splitlines()
    if not commits:
        print("ok: nenhum commit novo (clone à frente do origin)")
        return
    files = git("diff", "--name-only", "HEAD", f"origin/{BRANCH}").stdout.strip().splitlines()
    dirty = git("status", "--porcelain", "--untracked-files=no").stdout.strip().splitlines()

    notified_path = STATE / "deploy-notified.json"
    notified = json.loads(notified_path.read_text()) if notified_path.exists() else {}
    now = dt.datetime.now().timestamp()
    if notified.get("sha") == remote and now - notified.get("at", 0) < float(CFG["REALERT_HOURS"]) * 3600:
        print(f"ok: {remote[:7]} já enviado ao Albert-CLAUDE")
        return

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    path = ALERTS / f"deploy-{stamp}.json"
    path.write_text(json.dumps({
        "branch": BRANCH, "head": head, "remote": remote, "fast_forward": behind,
        "commits": commits, "files": files, "kinds": classify(files), "local_changes": dirty,
    }, indent=1, ensure_ascii=False))

    prompt = (f"[deploy] {len(commits)} commit(s) novo(s) em origin/{BRANCH} ({remote[:7]}). "
              f"Siga a seção 'Atualização da branch' de ~/licita-monitor/ALBERT.md com {path}.")
    ok, info = delegate(prompt)
    if not ok:
        print(f"falha ao acionar o agente: {info}; deploy pendente em {path}")
        sys.exit(1)
    notified_path.write_text(json.dumps({"sha": remote, "at": now}))
    print(f"{info} — {len(commits)} commit(s) ({remote[:7]}) em {path}")


# ---------------------------------------------------------------- relatório diário

def render_digest(m):
    u, ai, h, inf, net = m["users"], m["ai"], m["http"], m["infra"], m["net"]
    app = inf[CFG["APP_CONTAINER"]]
    alerts_24h = [p for p in ALERTS.glob("*.json") if p.stat().st_mtime > dt.datetime.now().timestamp() - 86400] if ALERTS.exists() else []
    lines = [
        f"### Relatório diário do servidor — {m['at'][:16].replace('T', ' ')}",
        "",
        "**Usuários**",
        f"- Total: **{u['total']}** (novos 24 h: {u['new_24h']}, 7 dias: {u['new_7d']}); ativos 24 h: {u['active_24h']}; em trial: {u['in_trial']}",
        f"- Assinaturas: {json.dumps(u['subscriptions'] or {}, ensure_ascii=False)}",
        "",
        "**Consumo da API (24 h)**",
        f"- HTTP: {h['requests']} requisições — 2xx {h['s2xx']}, 3xx {h['s3xx']}, 4xx {h['s4xx']}, 5xx {h['s5xx']}; p95 {h['p95_ms']} ms",
        f"- OpenAI hoje: US$ {ai['cost_today_usd']:.4f} de US$ {float(CFG['AI_DAILY_BUDGET_USD']):.0f} — títulos {ai['titles_today']}, perguntas {ai['asks_today']}, fichas {ai['sheets_today']}",
        "",
        "**Relatórios gerados**",
        f"- Fichas de edital (24 h): {ai['sheets_24h']}; perguntas ao edital hoje: {ai['asks_today']}; fila de IA: {ai['jobs_queued']}",
        f"- E-mails enviados (24 h): {m['emails']['sent_24h']} (falhas: {m['emails']['failed_24h']})",
        f"- Alertas do monitor (24 h): {len(alerts_24h)}",
        "",
        "**Coletas**",
    ]
    for r in m["ingest"]:
        lines.append(f"- {r['source']}: {r['status']} (início {str(r['started_at'])[:16]}, gravados {r.get('upserted')})")
    lines += [
        f"- Base: {m['counts']['tenders']} editais, {m['counts']['contracts']} contratos",
        "",
        "**Infra**",
        f"- App {app['status']}/{app['health']} (reinícios {app['restarts']}); disco {inf['disk_used_pct']}%; memória livre {inf['mem_available_mb']} MB; swap {inf['swap_used_mb']} MB; load {inf['load_1m']:.2f}",
        f"- readyz local {'ok' if net['local_readyz'][0] else 'FALHOU'}, público {'ok' if net['public_readyz'][0] else 'FALHOU'}; "
        + (f"borda {CFG['EDGE_URL']} {'ok' if net['edge_readyz'][0] else 'FALHOU'}" if CFG["EDGE_URL"] else f"ngrok {net['ngrok_url'] or 'SEM TÚNEL'}"),
    ]
    active = anomalies(m, {})
    lines += ["", "**Anomalias ativas**"] + ([f"- [{a['severity']}] {a['text']}" for a in active] or ["- nenhuma"])
    return "\n".join(lines)


def publish(body, path):
    path.write_text(body)
    if not CFG["MONITOR_ISSUE"]:
        return "sem MONITOR_ISSUE; relatório só em arquivo"
    p = run(["gh", "issue", "comment", CFG["MONITOR_ISSUE"], "--repo", CFG["GITHUB_REPO"], "--body-file", str(path)], timeout=60)
    return p.stdout.strip() if p.returncode == 0 else f"gh falhou: {p.stderr.strip()[:200]}"


def cmd_digest():
    REPORTS.mkdir(parents=True, exist_ok=True)
    m = collect()
    body = render_digest(m)
    print(publish(body, REPORTS / f"digest-{dt.date.today().isoformat()}.md"))


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    if action == "check":
        cmd_check()
    elif action == "digest":
        cmd_digest()
    elif action == "deploy":
        cmd_deploy()
    elif action == "delegate":
        # delegate --handoff <arquivo.md>  (repasse do Albert-CLAUDE no meio de uma tarefa)
        # delegate "<tarefa>"             (tarefa nova: Albert-CLAUDE, ou Codex se ele estiver sem cota)
        args = sys.argv[2:]
        if args[:1] == ["--handoff"] and len(args) == 2:
            text = Path(args[1]).read_text()
            ok, info = delegate(text, handoff=args[1])
        elif args:
            ok, info = delegate(" ".join(args))
        else:
            sys.exit(f"uso: {sys.argv[0]} delegate \"<tarefa>\" | delegate --handoff <arquivo.md>")
        print(info)
        sys.exit(0 if ok else 1)
    elif action == "status":
        print(json.dumps(collect(), default=str, indent=1, ensure_ascii=False))
    else:
        sys.exit(f"uso: {sys.argv[0]} check|deploy|delegate|digest|status")
