import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import {
  dateParameterValue,
  SAO_PAULO_TIME_ZONE,
} from "../lib/sao-paulo-date";

const dayStart = (value: Date): SQL =>
  sql`(${dateParameterValue(value)}::date::timestamp at time zone ${SAO_PAULO_TIME_ZONE})`;

const nextDayStart = (value: Date): SQL =>
  sql`((${dateParameterValue(value)}::date + 1)::timestamp at time zone ${SAO_PAULO_TIME_ZONE})`;

export const onOrAfterSaoPauloDate = (
  column: PgColumn,
  value: Date,
): SQL => sql`${column} >= ${dayStart(value)}`;

export const onOrBeforeSaoPauloDate = (
  column: PgColumn,
  value: Date,
): SQL => sql`${column} < ${nextDayStart(value)}`;
