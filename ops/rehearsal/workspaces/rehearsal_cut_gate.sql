\set ON_ERROR_STOP on
-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Apoio da ferramenta: avalia somente gatilhos mensuráveis sem aplicação em runtime.
DO $guard$
BEGIN
  IF current_database() !~ '_rehearsal$' THEN
    RAISE EXCEPTION 'Recusado: rehearsal_cut_gate.sql é rascunho de ensaio e só roda em banco terminado em _rehearsal (banco atual: %).', current_database();
  END IF;
END
$guard$;

DO $gate$
DECLARE
  elapsed_seconds numeric;
  actual_delta bigint;
  expected_delta bigint;
  error_percent numeric;
  p95_ratio numeric;
  drain_seconds numeric;
BEGIN
  SELECT extract(epoch FROM clock_timestamp() - cut_started), delta_rows
  INTO elapsed_seconds, actual_delta
  FROM rehearsal_cut_timing;
  expected_delta := current_setting('rehearsal.expected_delta_rows')::bigint;
  error_percent := current_setting('rehearsal.public_error_percent')::numeric;
  p95_ratio := current_setting('rehearsal.public_p95_ratio')::numeric;
  drain_seconds := current_setting('rehearsal.drain_seconds')::numeric;

  IF elapsed_seconds >= current_setting('rehearsal.point_of_no_return_seconds')::numeric THEN
    RAISE EXCEPTION 'ponto de não retorno alcançado antes do enforcement';
  END IF;
  IF expected_delta > 0 AND actual_delta > expected_delta * 3 THEN
    RAISE EXCEPTION 'delta excede 3x o previsto (% > 3x%)', actual_delta, expected_delta;
  END IF;
  IF drain_seconds > 180 THEN
    RAISE EXCEPTION 'drenagem observada excede 3 minutos';
  END IF;
  IF error_percent > 1 OR p95_ratio > 2 THEN
    RAISE EXCEPTION 'gate externo de leitura pública excedido';
  END IF;
END
$gate$;
