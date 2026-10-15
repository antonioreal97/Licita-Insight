import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { SCALE_DATABASE, scaleDatabaseUrl, withAdmin } from "./scale-db";

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const rows = Number(arg("--rows") ?? "1500000");
const seed = Number(arg("--seed") ?? "42");
const openCount = Number(arg("--open-count") ?? "27000");
const skipSchema = process.argv.includes("--skip-schema");
if (!Number.isSafeInteger(rows) || rows < 1 || rows > 2_000_000) {
  throw new Error("--rows must be an integer between 1 and 2000000");
}
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");
if (!Number.isSafeInteger(openCount) || openCount < 0 || openCount > rows) {
  throw new Error("--open-count must be an integer between 0 and --rows");
}

await withAdmin(async (admin) => {
  const exists = await admin.query("select 1 from pg_database where datname = $1", [SCALE_DATABASE]);
  if (exists.rowCount === 0) await admin.query(`create database ${SCALE_DATABASE}`);
});

if (!skipSchema) {
  const prepare = spawnSync("pnpm", ["--filter", "@workspace/db", "run", "prepare-extensions"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: scaleDatabaseUrl() },
    encoding: "utf8",
  });
  if (prepare.status !== 0) throw new Error(`Extension preparation failed\n${prepare.stdout}\n${prepare.stderr}`);
  const push = spawnSync("pnpm", ["--filter", "@workspace/db", "run", "push-force"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: scaleDatabaseUrl() },
    encoding: "utf8",
  });
  if (push.status !== 0) throw new Error(`Schema push failed\n${push.stdout}\n${push.stderr}`);
}

const client = new Client({ connectionString: scaleDatabaseUrl() });
await client.connect();
try {
  await client.query("truncate table tenders cascade");
  const startedAt = performance.now();
  await client.query(
    `
      insert into tenders (
        id, pncp_control_number, title, display_title, display_title_norm, object_summary, description,
        organization_id, organization_name, purchasing_unit, modality,
        modality_label, status, tender_number, process_number, estimated_value,
        estimated_value_status, published_at, opening_at, proposal_deadline,
        state, city, city_ibge_code, source_id, source_name, source_url,
        platform, platform_label,
        categories, items, documents, timeline, search_text, title_norm,
        object_norm, items_norm, organization_norm, other_norm, city_norm,
        raw_payload, fetched_at, details_fetched_at
      )
      select
        'SYN-' || lpad(i::text, 9, '0'),
        'SYN-' || $2::text || '-' || i::text,
        'Contratação de ' || vocab.object_name || ' ' || i::text,
        'Contratação de ' || vocab.object_name || ' ' || i::text,
        lower('contratacao de ' || vocab.object_name || ' ' || i::text),
        vocab.object_name || ' para atendimento continuado dos órgãos públicos',
        'Contratação conforme especificações técnicas, níveis de serviço, prazos e condições do edital.',
        'ORG-' || lpad(((i + $2) % 5000)::text, 4, '0'),
        'Órgão Público ' || ((i + $2) % 5000)::text,
        'Unidade de Compras ' || ((i + $2) % 800)::text,
        mods.slug,
        mods.label,
        case
          when i <= $3 then 'open'
          when (i - $3) % 10 < 7 then 'closed'
          when (i - $3) % 10 = 7 then 'under_review'
          when (i - $3) % 10 = 8 then 'suspended'
          else 'cancelled'
        end,
        (1000 + i)::text || '/2026',
        'PROC-' || i::text,
        ((i::bigint * 7919 + $2) % 500000000 + 1000)::numeric / 100,
        'disclosed',
        case
          when i <= $3 then now() - interval '1 day' * (((i + $2) % 30) + 1)
          else now() - interval '1 day' * (((i + $2) % 730) + 16)
        end,
        case
          when i <= $3 then now() + interval '1 day' * (((i + $2) % 10) + 1)
          else now() - interval '1 day' * (((i + $2) % 730) + 10)
        end,
        case
          when i <= $3 then now() + interval '1 day' * (((i + $2) % 30) + 1)
          else now() - interval '1 day' * (((i + $2) % 730) + 1)
        end,
        states.uf,
        'Município ' || ((i + $2) % 5570)::text,
        lpad((((i + $2) % 5570) + 1000000)::text, 7, '0'),
        'synthetic',
        'SYNTHETIC',
        null,
        plats.slug,
        plats.label,
        jsonb_build_array(jsonb_build_object('slug', vocab.category_slug, 'label', vocab.category_label)),
        item_rows.items,
        '[]'::jsonb,
        '[]'::jsonb,
        concat_ws(' ',
          vocab.object_name,
          case when i % 2 = 0 then 'contratacao servico fornecimento edital publico' else '' end,
          case when i % 20 = 0 then 'tecnologia integracao especializada' else '' end,
          case when i % 1000 = 0 then 'ultrassom veterinario portatil' else '' end,
          item_rows.item_text,
          'orgao publico unidade compras municipio ' || states.uf,
          plats.label,
          'requisitos tecnicos qualidade prazo entrega fiscalizacao garantia sustentabilidade'
        ),
        lower('contratacao de ' || vocab.object_name || ' ' || i::text),
        lower(vocab.object_name || ' para atendimento continuado dos orgaos publicos'),
        item_rows.item_text,
        lower('orgao publico ' || ((i + $2) % 5000)::text),
        'edital publico requisitos tecnicos qualidade prazo entrega',
        lower('municipio ' || ((i + $2) % 5570)::text),
        jsonb_build_object('synthetic', true),
        now(),
        now()
      from generate_series(1, $1::int) i
      cross join lateral (
        select
          (array[
            'limpeza predial e conservacao',
            'merenda escolar e generos alimenticios',
            'pavimentacao asfaltica e drenagem',
            'asfalto e recapeamento de vias',
            'medicamentos e insumos hospitalares',
            'material de escritorio e expediente',
            'obras de engenharia civil',
            'equipamentos de informatica',
            'transporte escolar',
            'manutencao preventiva veicular',
            'servicos de vigilancia patrimonial',
            'uniformes e vestuario profissional'
          ])[((i + $2) % 12) + 1] object_name,
          (array[
            'limpeza-higiene',
            'alimentacao',
            'obras-engenharia',
            'obras-engenharia',
            'medicamentos-insumos-saude',
            'material-escritorio',
            'obras-engenharia',
            'ti-telecom',
            'transporte-locacao-veiculos',
            'veiculos-pecas',
            'seguranca-incendio',
            'uniformes-textil'
          ])[((i + $2) % 12) + 1] category_slug,
          (array[
            'Limpeza, higiene e dedetização',
            'Alimentação',
            'Obras e engenharia',
            'Obras e engenharia',
            'Medicamentos e insumos de saúde',
            'Material de escritório e expediente',
            'Obras e engenharia',
            'Tecnologia da informação e telecomunicações',
            'Transporte e locação de veículos',
            'Veículos, peças e manutenção',
            'Segurança, vigilância e prevenção de incêndio',
            'Uniformes, tecidos e confecção'
          ])[((i + $2) % 12) + 1] category_label
      ) vocab
      cross join lateral (
        select (array['pregao_eletronico','pregao_presencial','concorrencia','concorrencia_eletronica','dispensa','inexigibilidade','credenciamento','leilao'])[((i + $2) % 8) + 1] slug,
               (array['Pregão eletrônico','Pregão presencial','Concorrência','Concorrência eletrônica','Dispensa','Inexigibilidade','Credenciamento','Leilão'])[((i + $2) % 8) + 1] label
      ) mods
      cross join lateral (
        select (array['comprasgov','licitanet','bll','bnc','portal-compras-publicas','licitacoes-e'])[((i + $2) % 6) + 1] slug,
               (array['Compras.gov.br','Licitanet','BLL Compras','BNC (Bolsa Nacional de Compras)','Portal de Compras Públicas','Licitações-e (Banco do Brasil)'])[((i + $2) % 6) + 1] label
      ) plats
      cross join lateral (
        select (array['SP','SP','SP','MG','MG','RJ','RJ','BA','PR','RS','PE','CE','PA','SC','GO','MA','AM','ES','PB','RN','AL','PI','MT','MS','DF','SE','RO','TO','AC','AP','RR'])[((i + $2) % 31) + 1] uf
      ) states
      cross join lateral (
        select jsonb_agg(jsonb_build_object(
                 'id', 'ITEM-' || n::text,
                 'description', vocab.object_name || ' item ' || n::text,
                 'quantity', ((i + n) % 100) + 1,
                 'unit', 'UN',
                 'estimatedUnitValue', null,
                 'estimatedTotalValue', null
               )) items,
               string_agg(vocab.object_name || ' item ' || n::text, ' ') item_text
        from generate_series(1, 1 + ((i + $2) % 5)) n
      ) item_rows
    `,
    [rows, seed, openCount],
  );
  await client.query("analyze tenders");
  const stats = await client.query<{
    rows: number;
    open_pct: number;
    avg_search_bytes: number;
    avg_items: number;
    database_bytes: string;
  }>(`
    select count(*)::int rows,
           round(100.0 * count(*) filter (where status = 'open') / count(*), 2)::float8 open_pct,
           round(avg(octet_length(search_text)))::int avg_search_bytes,
           round(avg(jsonb_array_length(items)), 2)::float8 avg_items,
           pg_database_size(current_database())::text database_bytes
    from tenders
  `);
  process.stdout.write(`${JSON.stringify({
    ...stats.rows[0],
    seed,
    elapsedMs: Math.round(performance.now() - startedAt),
  }, null, 2)}\n`);
} finally {
  await client.end();
}
