const USAGE = `Uso: node artifacts/api-server/dist/reconcile-billing.mjs [--dry-run]

Reconcilia as assinaturas com o Asaas, com a mesma regra do job billing_reconciliation.
Lê DATABASE_URL e as variáveis ASAAS_* do ambiente do processo.

  --dry-run  consulta o Asaas e conta as transições, sem gravar
  --help     mostra esta ajuda

Sem --dry-run, toma o mesmo lock do job agendado e falha se ele estiver rodando.
Imprime só contagens; sai com código diferente de zero em erro ou falha de consulta.`;

const run = async (dryRun: boolean) => {
  const [
    { pool },
    { requireAsaasConfig },
    { billingReconcileConfig, reconcileSubscriptions },
    { tryRunSingletonJob },
  ] = await Promise.all([
    import("@workspace/db"),
    import("./asaas-client"),
    import("./billing-reconciliation"),
    import("../jobs/job-lock"),
  ]);
  try {
    requireAsaasConfig();
    const { maxRows, pauseMs } = billingReconcileConfig();
    const reconcile = () =>
      reconcileSubscriptions({ maxRows, pauseMs, dryRun });
    let result;
    if (dryRun) {
      result = await reconcile();
    } else {
      const locked = await tryRunSingletonJob(
        "billing_reconciliation",
        reconcile,
      );
      if (!locked.acquired) {
        console.error(
          "A reconciliação agendada (billing_reconciliation) está rodando; tente de novo quando ela terminar.",
        );
        process.exitCode = 1;
        return;
      }
      result = locked.value;
    }
    const { nextUserId, ...summary } = result;
    console.log(
      JSON.stringify(
        { dryRun, ...summary, complete: nextUserId === null },
        null,
        2,
      ),
    );
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--dry-run" && arg !== "--help");
if (args.includes("--help")) {
  console.log(USAGE);
} else if (unknown.length > 0) {
  console.error(`Argumento desconhecido: ${unknown.join(" ")}\n\n${USAGE}`);
  process.exitCode = 2;
} else {
  run(args.includes("--dry-run")).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
