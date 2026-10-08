import { pool } from "@workspace/db";
import {
  rebuildProfileKeywordVocabulary,
  suggestProfileKeywords,
} from "../src/profile/keyword-vocabulary";

const url = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.PROFILE_KEYWORD_BENCHMARK !== "1" ||
  !["127.0.0.1", "localhost"].includes(url.hostname)
) {
  throw new Error(
    "Benchmark refuses to run without PROFILE_KEYWORD_BENCHMARK=1 on a local isolated database",
  );
}
const target = Number(process.env.PROFILE_KEYWORD_BENCHMARK_TENDERS ?? 100_000);
if (!Number.isSafeInteger(target) || target < 1 || target > 200_000)
  throw new Error("Invalid PROFILE_KEYWORD_BENCHMARK_TENDERS");

try {
  const existing = await pool.query<{ count: number }>(
    "select count(*)::int as count from tenders",
  );
  if (Number(existing.rows[0]?.count) !== 0)
    throw new Error("Benchmark database must have an empty tenders table");
  const seededAt = performance.now();
  await pool.query(
    `insert into tenders (
      id, pncp_control_number, title, object_summary, description, organization_id, organization_name,
      modality, modality_label, status, estimated_value_status, proposal_deadline, source_id, source_name,
      categories, items, documents, timeline, search_text, title_norm, object_norm, items_norm,
      organization_norm, other_norm, raw_payload, fetched_at
    )
    select
      'bench-' || n, 'bench-control-' || n,
      case n % 5
        when 0 then 'Locação de sonorização, caixa de som e mesa de som para eventos'
        when 1 then 'Iluminação cênica com refletores e painel de LED'
        when 2 then 'Aquisição de medicamentos e material hospitalar'
        when 3 then 'Serviço de limpeza predial e conservação'
        else 'Fornecimento de servidores, notebooks e suporte técnico'
      end,
      case n % 5
        when 0 then 'Sistema de áudio profissional para apresentações públicas'
        when 1 then 'Estrutura de luz para palco e eventos culturais'
        when 2 then 'Insumos para unidades de saúde'
        when 3 then 'Equipe e materiais para higienização'
        else 'Equipamentos de tecnologia da informação'
      end,
      null, 'org-' || (n % 100), 'Órgão sintético ' || (n % 100), '6', 'Pregão eletrônico', 'open', 'published',
      now() + interval '30 days', 'pncp', 'PNCP',
      case n % 5
        when 0 then '[{"slug":"eventos-cultura","label":"Eventos, shows e cultura"}]'::jsonb
        when 1 then '[{"slug":"eventos-cultura","label":"Eventos, shows e cultura"}]'::jsonb
        when 2 then '[{"slug":"medicamentos-insumos-saude","label":"Medicamentos e insumos de saúde"}]'::jsonb
        when 3 then '[{"slug":"limpeza-higiene","label":"Limpeza, higiene e dedetização"}]'::jsonb
        else '[{"slug":"ti-telecom","label":"Tecnologia da informação e telecomunicações"}]'::jsonb
      end,
      case n % 5
        when 0 then '[{"id":"1","description":"Caixa de som ativa, microfone e mesa de som","quantity":1,"unit":"un","estimatedUnitValue":null,"estimatedTotalValue":null}]'::jsonb
        when 1 then '[{"id":"1","description":"Refletor LED e painel de LED","quantity":1,"unit":"un","estimatedUnitValue":null,"estimatedTotalValue":null}]'::jsonb
        else '[]'::jsonb
      end,
      '[]'::jsonb, '[]'::jsonb,
      lower(case n % 5
        when 0 then 'Locação de sonorização caixa de som mesa de som sistema de áudio profissional eventos'
        when 1 then 'Iluminação cênica refletores painel de LED estrutura luz palco eventos culturais'
        when 2 then 'Aquisição medicamentos material hospitalar insumos unidades saúde'
        when 3 then 'Serviço limpeza predial conservação equipe materiais higienização'
        else 'Fornecimento servidores notebooks suporte técnico equipamentos tecnologia informação'
      end), '', '', '', '', '', '{}'::jsonb, now()
    from generate_series(1, $1::int) n`,
    [target],
  );
  const seedMs = Math.round(performance.now() - seededAt);
  const build = await rebuildProfileKeywordVocabulary();
  await pool.query("analyze profile_keyword_vocabulary");
  const durations: number[] = [];
  const queries = ["som", "iluminacao", "painel de led", "servid", "limpeza"];
  for (let index = 0; index < 500; index += 1) {
    const started = performance.now();
    await suggestProfileKeywords(queries[index % queries.length]!);
    durations.push(performance.now() - started);
  }
  durations.sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    Number(durations[Math.ceil(durations.length * fraction) - 1]!.toFixed(2));
  console.log(
    JSON.stringify(
      {
        syntheticTenders: target,
        seedMs,
        build,
        suggestMs: {
          p50: percentile(0.5),
          p95: percentile(0.95),
          p99: percentile(0.99),
          samples: durations.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
