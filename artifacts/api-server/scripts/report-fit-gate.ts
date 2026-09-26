import pg from "pg";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const json = args.includes("--json");
if (args.some((arg) => arg !== "--json")) throw new Error("Usage: report:fit-gate [--json]");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const client = new pg.Pool({ connectionString, max: 4 });
try {
  const [matrixResult, summaryResult, missesResult, statusResult] = await Promise.all([
    client.query<{ gate: boolean; level: string; count: string }>(`
      select lexical_gate_pass as gate, level, count(*)::text as count
      from company_tender_fits
      where status = 'ready' and lexical_gate_pass is not null
      group by lexical_gate_pass, level order by lexical_gate_pass desc, level`),
    client.query<{ measured: string; positive: string; positive_passed: string; failed: string; saved_cost: string }>(`
      select count(*)::text as measured,
             count(*) filter (where level in ('high', 'medium'))::text as positive,
             count(*) filter (where lexical_gate_pass and level in ('high', 'medium'))::text as positive_passed,
             count(*) filter (where not lexical_gate_pass)::text as failed,
             coalesce(sum(estimated_cost_usd) filter (where not lexical_gate_pass), 0)::text as saved_cost
      from company_tender_fits
      where status = 'ready' and lexical_gate_pass is not null`),
    client.query<{ tender_id: string; title: string; score: string }>(`
      select fits.tender_id, tenders.title, fits.score::text
      from company_tender_fits fits join tenders on tenders.id = fits.tender_id
      where fits.status = 'ready' and fits.lexical_gate_pass = false
        and fits.level in ('high', 'medium')
      order by fits.score desc nulls last, fits.tender_id`),
    client.query<{ status_group: string; count: string }>(`
      select case when tenders.status = 'open' then 'open' else 'closed' end as status_group,
             count(*)::text as count
      from company_tender_fits fits join tenders on tenders.id = fits.tender_id
      where fits.status = 'ready' and fits.lexical_gate_pass is not null
      group by status_group order by status_group`),
  ]);
  const summary = summaryResult.rows[0];
  const positive = Number(summary?.positive ?? 0);
  const report = {
    measured: Number(summary?.measured ?? 0),
    matrix: matrixResult.rows.map((row) => ({ gate: row.gate, level: row.level, count: Number(row.count) })),
    recallHighMedium: positive === 0 ? null : Number(summary?.positive_passed ?? 0) / positive,
    potentialJevCallsSaved: Number(summary?.failed ?? 0),
    potentialCostSavedUsd: Number(summary?.saved_cost ?? 0),
    missedHighMedium: missesResult.rows.map((row) => ({ tenderId: row.tender_id, title: row.title, score: Number(row.score) })),
    tenderStatus: Object.fromEntries(statusResult.rows.map((row) => [row.status_group, Number(row.count)])),
    activationRule: { minimumMeasured: 500, minimumRecallHighMedium: 0.97 },
  };
  if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    process.stdout.write(`Gate lexical do fit: ${report.measured} avaliações medidas\n`);
    for (const row of report.matrix) process.stdout.write(`  gate=${row.gate} nível=${row.level}: ${row.count}\n`);
    process.stdout.write(`Recall alta+média: ${report.recallHighMedium === null ? "n/a" : `${(report.recallHighMedium * 100).toFixed(2)}%`}\n`);
    process.stdout.write(`Economia potencial: ${report.potentialJevCallsSaved} chamadas | US$ ${report.potentialCostSavedUsd.toFixed(8)}\n`);
    process.stdout.write(`Status dos editais: abertos ${report.tenderStatus.open ?? 0} | encerrados ${report.tenderStatus.closed ?? 0}\n`);
    process.stdout.write(`Perdas alta/média: ${report.missedHighMedium.length}\n`);
    for (const row of report.missedHighMedium) process.stdout.write(`  ${row.tenderId} score=${row.score.toFixed(7)} ${row.title}\n`);
    process.stdout.write("Ativação: somente com ≥500 medições e recall alta+média ≥97%; decisão manual do owner.\n");
  }
} finally {
  await client.end();
}
