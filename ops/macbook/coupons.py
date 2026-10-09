#!/usr/bin/env python3
"""Cupons de acesso do Pardal Digital, administrados no servidor (sem endpoint público).

Os cupons nascem INATIVOS (starts_at em 2099): ninguém consegue usar um código que o owner ainda não ativou.
O banco guarda só o hash SHA-256 e os 4 últimos caracteres; os códigos completos ficam num arquivo 600 em
~/licita-cupons/, visível só para o owner.

Uso:
  coupons.py create --days 7|30 --count N [--max-uses 1] [--expires AAAA-MM-DD]
  coupons.py list
  coupons.py activate <final4|id>      # passa a valer agora
  coupons.py deactivate <final4|id>    # volta a ficar inativo (não afeta quem já resgatou)
"""
import argparse, datetime as dt, hashlib, os, secrets, subprocess, sys, uuid
from pathlib import Path

PG = os.environ.get("PG_CONTAINER", "licita-macbook-postgres-1")
PENDING = "2099-01-01T00:00:00Z"
OUT = Path.home() / "licita-cupons"


def psql(sql, *params):
    args = ["docker", "exec", "-i", PG, "psql", "-q", "-U", "licita", "-d", "licita", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|"]
    for i, p in enumerate(params, 1):
        args += ["-v", f"p{i}={p}"]
    r = subprocess.run(args, input=sql, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr.strip())
    return r.stdout.strip()


def code_for(days):
    return f"PARDAL-{days}D-{secrets.token_hex(5).upper()}"


def create(a):
    OUT.mkdir(mode=0o700, exist_ok=True)
    expires = f"{a.expires}T23:59:59-03:00" if a.expires else None
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    path = OUT / f"cupons-{a.days}d-{stamp}.txt"
    lines = []
    for _ in range(a.count):
        code = code_for(a.days)
        h = hashlib.sha256(code.encode()).hexdigest()
        cid = str(uuid.uuid4())
        psql("insert into coupon_codes (id, code_hash, code_last4, duration_days, max_redemptions, starts_at, expires_at) "
             "values (:'p1', :'p2', :'p3', :'p4'::int, :'p5'::int, "
             # Inativo = início no futuro; com prazo de resgate, o início pendente fica 1 s antes do prazo.
             "least(:'p6'::timestamptz, nullif(:'p7','')::timestamptz - interval '1 second'), nullif(:'p7','')::timestamptz);",
             cid, h, code[-4:], a.days, a.max_uses, PENDING, expires or "")
        lines.append(f"{code}\t{a.days} dias\tusos: {a.max_uses}\tid: {cid}")
    path.write_text("\n".join(lines) + "\n")
    path.chmod(0o600)
    print(f"{a.count} cupons de {a.days} dias criados INATIVOS. Códigos em {path} (só você lê).")
    print("Para ativar: coupons.py activate <4 últimos caracteres>")


def listing(_):
    print("final | dias | usos | status | ativo desde | expira")
    print(psql("select code_last4, duration_days, redeemed_count||'/'||max_redemptions, "
               "case when revoked_at is not null then 'revogado' when starts_at > now() then 'INATIVO' "
               "when expires_at is not null and expires_at < now() then 'expirado' "
               "when redeemed_count >= max_redemptions then 'esgotado' else 'ATIVO' end, "
               "case when starts_at > now() then '-' else coalesce(to_char(starts_at at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),'-') end, "
               "coalesce(to_char(expires_at at time zone 'America/Sao_Paulo','DD/MM/YYYY'),'-') "
               "from coupon_codes order by created_at;"))


def set_start(ref, value, label):
    out = psql("update coupon_codes set starts_at = " + value + " where (code_last4 = upper(:'p1') or id = :'p1') "
               "and revoked_at is null and (expires_at is null or expires_at > now()) returning code_last4;", ref)
    if not out:
        sys.exit(f"Nenhum cupom encontrado para '{ref}'.")
    if len(out.splitlines()) > 1:
        sys.exit("Mais de um cupom com esse final; use o id do arquivo de códigos.")
    print(f"Cupom ...{out} {label}.")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create"); c.add_argument("--days", type=int, choices=[7, 30], required=True)
    c.add_argument("--count", type=int, required=True); c.add_argument("--max-uses", type=int, default=1)
    c.add_argument("--expires", help="data limite para resgate, AAAA-MM-DD"); c.set_defaults(fn=create)
    sub.add_parser("list").set_defaults(fn=listing)
    for name, value, label in (("activate", "now()", "ATIVADO — já pode ser resgatado"),
                               ("deactivate", f"least('{PENDING}'::timestamptz, expires_at - interval '1 second')", "desativado")):
        s = sub.add_parser(name); s.add_argument("ref")
        s.set_defaults(fn=lambda a, v=value, l=label: set_start(a.ref, v, l))
    a = p.parse_args(); a.fn(a)


if __name__ == "__main__":
    main()
