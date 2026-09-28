import pg from "pg";
const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required explicitly; refusing .env fallback");
const [command, rawEmail, rawUntil] = process.argv.slice(2);
const pool = new Pool({ connectionString: url, max: 1 });
try {
  const email = rawEmail?.trim().toLowerCase();
  if (command === "grant" && email && rawUntil) {
    const until = new Date(rawUntil); if (!email.includes("@") || Number.isNaN(until.getTime())) throw new Error("usage: grant email ISO-until");
    await pool.query("INSERT INTO beta_access_grants(email,access_until,revoked_at) VALUES($1,$2,NULL) ON CONFLICT(email) DO UPDATE SET access_until=$2,revoked_at=NULL,updated_at=now()", [email, until]);
    console.log(`granted ${email} until ${until.toISOString()}`);
  } else if (command === "revoke" && email) {
    await pool.query("UPDATE beta_access_grants SET revoked_at=now(),updated_at=now() WHERE lower(email)=lower($1)", [email]); console.log(`revoked ${email}`);
  } else if (command === "list") {
    const { rows } = await pool.query("SELECT email,access_until,revoked_at FROM beta_access_grants ORDER BY email");
    for (const row of rows) console.log(`${row.email}\t${new Date(row.access_until).toISOString()}\t${row.revoked_at ? "revoked" : "active"}`);
  } else throw new Error("usage: grant email ISO-until | revoke email | list");
} finally { await pool.end(); }
