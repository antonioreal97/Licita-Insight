import pg from "pg";

const { Pool } = pg;

type Options = { days: number; user?: string; json: boolean };
const parseOptions = (args: string[]): Options => {
  const options: Options = { days: 30, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--json") options.json = true;
    else if (arg === "--days") {
      const value = Number(args[++index]);
      if (!Number.isSafeInteger(value) || value < 1 || value > 3_650) {
        throw new Error("--days must be an integer from 1 to 3650");
      }
      options.days = value;
    } else if (arg === "--user") {
      const value = args[++index]?.trim();
      if (!value) throw new Error("--user requires an id or email");
      options.user = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
};

const numeric = (value: unknown): number => Number(value ?? 0);
const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
};

const options = parseOptions(process.argv.slice(2));
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const client = new Pool({ connectionString, max: 5 });

try {
  let userId: string | undefined;
  if (options.user) {
    const found = await client.query<{ id: string }>(
      "select id from users where id = $1 or lower(email) = lower($1) limit 1",
      [options.user],
    );
    userId = found.rows[0]?.id;
    if (!userId) throw new Error(`User not found: ${options.user}`);
  }
  const ledgerParams: unknown[] = [options.days];
  const userClause = userId ? "and user_id = $2" : "";
  if (userId) ledgerParams.push(userId);
  const [byFeatureResult, dailyResult, usersResult, askCapsResult, fitCapsResult] = await Promise.all([
    client.query<{ feature: string; calls: string; tokens: string; cost_usd: string }>(`
      select feature, count(*)::text as calls, coalesce(sum(input_tokens), 0)::text as tokens,
             coalesce(sum(cost_usd), 0)::text as cost_usd
      from ai_usage_ledger
      where occurred_at >= now() - ($1::int * interval '1 day') ${userClause}
      group by feature order by feature`, ledgerParams),
    client.query<{ day: string; calls: string; tokens: string; cost_usd: string }>(`
      select (occurred_at at time zone 'America/Sao_Paulo')::date::text as day,
             count(*)::text as calls, coalesce(sum(input_tokens), 0)::text as tokens,
             coalesce(sum(cost_usd), 0)::text as cost_usd
      from ai_usage_ledger
      where occurred_at >= now() - ($1::int * interval '1 day') ${userClause}
      group by day order by day`, ledgerParams),
    client.query<{ user_id: string; email: string; cost_usd: string }>(`
      select ledger.user_id, users.email, sum(ledger.cost_usd)::text as cost_usd
      from ai_usage_ledger ledger join users on users.id = ledger.user_id
      where ledger.occurred_at >= now() - ($1::int * interval '1 day')
        and ledger.user_id is not null ${userId ? "and ledger.user_id = $2" : ""}
      group by ledger.user_id, users.email order by sum(ledger.cost_usd) desc`, ledgerParams),
    client.query<{ touched: string; tracked: string; used: string; capacity: string }>(`
      select count(*) filter (where usage.used >= case
               when subscriptions.status = 'active'
                 or (subscriptions.status = 'canceled' and subscriptions.current_period_end > now())
               then $3::int else $2::int end)::text as touched,
             count(*)::text as tracked, coalesce(sum(usage.used), 0)::text as used,
             coalesce(sum(case
               when subscriptions.status = 'active'
                 or (subscriptions.status = 'canceled' and subscriptions.current_period_end > now())
               then $3::int else $2::int end), 0)::text as capacity
      from ai_daily_usage usage
      left join subscriptions on subscriptions.user_id = usage.user_id
      where usage.quota_day >= (now() at time zone 'America/Sao_Paulo')::date - $1::int
        ${userId ? "and usage.user_id = $4" : ""}`,
      [options.days, Number(process.env.AI_DAILY_ASK_LIMIT_TRIAL ?? 5), Number(process.env.AI_DAILY_ASK_LIMIT_PAID ?? 30), ...(userId ? [userId] : [])]),
    client.query<{ touched: string; tracked: string; used: string; capacity: string }>(`
      select count(*) filter (where used >= $2::int)::text as touched, count(*)::text as tracked,
             coalesce(sum(used), 0)::text as used, (count(*) * $2::int)::text as capacity
      from ai_fit_daily_usage
      where quota_day >= (now() at time zone 'America/Sao_Paulo')::date - $1::int
        ${userId ? "and user_id = $3" : ""}`,
      [options.days, Number(process.env.AI_DAILY_FIT_LIMIT ?? 1_000), ...(userId ? [userId] : [])]),
  ]);

  const byFeature = Object.fromEntries(byFeatureResult.rows.map((row) => [row.feature, {
    calls: numeric(row.calls), tokens: numeric(row.tokens), costUsd: numeric(row.cost_usd),
  }]));
  const total = Object.values(byFeature).reduce((sum, row) => ({
    calls: sum.calls + row.calls, tokens: sum.tokens + row.tokens, costUsd: sum.costUsd + row.costUsd,
  }), { calls: 0, tokens: 0, costUsd: 0 });
  const userCosts = usersResult.rows.map((row) => numeric(row.cost_usd));
  const userStats = {
    active: userCosts.length,
    averageCostUsd: userCosts.length ? userCosts.reduce((sum, value) => sum + value, 0) / userCosts.length : 0,
    p50CostUsd: percentile(userCosts, 0.5), p90CostUsd: percentile(userCosts, 0.9),
    p99CostUsd: percentile(userCosts, 0.99), maxCostUsd: Math.max(0, ...userCosts),
  };
  const elapsedDays = Math.max(1, options.days);
  const report = {
    period: { days: options.days, userId: userId ?? null, generatedAt: new Date().toISOString() },
    total, byFeature,
    platform: byFeature.sheet ?? { calls: 0, tokens: 0, costUsd: 0 },
    userAttributed: {
      calls: (byFeature.ask?.calls ?? 0) + (byFeature.fit?.calls ?? 0),
      tokens: (byFeature.ask?.tokens ?? 0) + (byFeature.fit?.tokens ?? 0),
      costUsd: (byFeature.ask?.costUsd ?? 0) + (byFeature.fit?.costUsd ?? 0),
    },
    daily: dailyResult.rows.map((row) => ({ day: row.day, calls: numeric(row.calls), tokens: numeric(row.tokens), costUsd: numeric(row.cost_usd) })),
    users: { ...userStats, top10: usersResult.rows.slice(0, 10).map((row) => ({ userId: row.user_id, email: row.email, costUsd: numeric(row.cost_usd) })) },
    ceilings: {
      ask: {
        daysTouched: numeric(askCapsResult.rows[0]?.touched),
        userDaysTracked: numeric(askCapsResult.rows[0]?.tracked),
        percentUsed: numeric(askCapsResult.rows[0]?.capacity) > 0
          ? numeric(askCapsResult.rows[0]?.used) / numeric(askCapsResult.rows[0]?.capacity) * 100 : 0,
      },
      fit: {
        daysTouched: numeric(fitCapsResult.rows[0]?.touched),
        userDaysTracked: numeric(fitCapsResult.rows[0]?.tracked),
        percentUsed: numeric(fitCapsResult.rows[0]?.capacity) > 0
          ? numeric(fitCapsResult.rows[0]?.used) / numeric(fitCapsResult.rows[0]?.capacity) * 100 : 0,
      },
    },
    projectedMonthlyCostUsd: total.costUsd / elapsedDays * 30,
    projectionNote: "Extrapolação simples da média diária do período × 30; não é previsão.",
  };
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    process.stdout.write(`Custo de IA — últimos ${options.days} dias${userId ? ` — usuário ${userId}` : ""}\n`);
    process.stdout.write(`Total: ${total.calls} chamadas | ${total.tokens} tokens | US$ ${total.costUsd.toFixed(8)}\n`);
    for (const feature of ["ask", "fit", "sheet"]) {
      const row = byFeature[feature] ?? { calls: 0, tokens: 0, costUsd: 0 };
      process.stdout.write(`${feature}: ${row.calls} chamadas | ${row.tokens} tokens | US$ ${row.costUsd.toFixed(8)}\n`);
    }
    process.stdout.write(`Usuários ativos: ${userStats.active} | média US$ ${userStats.averageCostUsd.toFixed(8)} | p50 ${userStats.p50CostUsd.toFixed(8)} | p90 ${userStats.p90CostUsd.toFixed(8)} | p99 ${userStats.p99CostUsd.toFixed(8)} | máx ${userStats.maxCostUsd.toFixed(8)}\n`);
    process.stdout.write(`Teto: ask ${report.ceilings.ask.daysTouched}/${report.ceilings.ask.userDaysTracked} user-days (${report.ceilings.ask.percentUsed.toFixed(1)}% usado); fit ${report.ceilings.fit.daysTouched}/${report.ceilings.fit.userDaysTracked} user-days (${report.ceilings.fit.percentUsed.toFixed(1)}% usado)\n`);
    process.stdout.write(`Projeção mensal: US$ ${report.projectedMonthlyCostUsd.toFixed(8)} (${report.projectionNote})\n`);
    process.stdout.write("Top 10:\n");
    for (const row of report.users.top10) process.stdout.write(`  ${row.userId} <${row.email}> US$ ${row.costUsd.toFixed(8)}\n`);
  }
} finally {
  await client.end();
}
