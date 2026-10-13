import { sql } from "drizzle-orm";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { logger } from "../lib/logger";

const DAY_MS = 86_400_000;
const TZ = "America/Sao_Paulo";
export const REDACTED_RECIPIENT = "expurgado@pardaldigital.invalid";

const positiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

const hourFromEnv = (): number => {
  const raw = process.env.PERSONAL_DATA_RETENTION_HOUR?.trim();
  if (!raw) return 3;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 23) {
    throw new Error("PERSONAL_DATA_RETENTION_HOUR must be an integer from 0 to 23");
  }
  return value;
};

export type PersonalDataRetentionConfig = {
  sessionDays: number;
  readNotificationDays: number;
  emailContentDays: number;
  hour: number;
};

export const personalDataRetentionConfig = (): PersonalDataRetentionConfig => ({
  sessionDays: positiveInteger("SESSION_RETENTION_DAYS", 30),
  readNotificationDays: positiveInteger("READ_NOTIFICATION_RETENTION_DAYS", 180),
  emailContentDays: positiveInteger("EMAIL_CONTENT_RETENTION_DAYS", 180),
  hour: hourFromEnv(),
});

const cutoff = (now: Date, days: number): Date => new Date(now.getTime() - days * DAY_MS);

export type PersonalDataRetentionResult = {
  sessionsDeleted: number;
  notificationsDeleted: number;
  emailDeliveriesRedacted: number;
};

const NOTHING_PURGED: PersonalDataRetentionResult = {
  sessionsDeleted: 0,
  notificationsDeleted: 0,
  emailDeliveriesRedacted: 0,
};

/**
 * Deletes obsolete records and strips email content while retaining only the minimum send audit. The statements are
 * the same in both cutover modes (they select by age, never by owner), but notifications and deliveries are in the
 * workspace scope: the purge is a cycle that does not start while writes are paused and writes through the gate.
 */
export async function purgeRetainedPersonalData(
  now = new Date(),
  config = personalDataRetentionConfig(),
): Promise<PersonalDataRetentionResult> {
  // Loaded here, like the pool before them, so the schedule helpers of this module need no database to be imported.
  const { cycleCaller, discardedByCutover, startCutoverCycle } = await import("../workspaces/cutover-cycle");
  const { withCutoverGate } = await import("../workspaces/cutover-gate");
  const cycle = await startCutoverCycle("personal_data_retention");
  if (!cycle) return NOTHING_PURGED;
  try {
    return await withCutoverGate(cycleCaller(cycle), async (tx) => {
      const sessions = await tx.execute(sql`
        delete from sessions
        where expires_at < ${cutoff(now, config.sessionDays)}
          or (revoked_at is not null and revoked_at < ${cutoff(now, config.sessionDays)})
        returning id`);
      const notifications = await tx.execute(sql`
        delete from notifications
        where read_at is not null and read_at < ${cutoff(now, config.readNotificationDays)}
        returning id`);
      const deliveries = await tx.execute(sql`
        update email_deliveries
        set recipient_email = ${REDACTED_RECIPIENT},
            html_body = '',
            text_body = '',
            message_headers = '{}'::jsonb,
            last_error = null
        where created_at < ${cutoff(now, config.emailContentDays)}
          and (recipient_email <> ${REDACTED_RECIPIENT} or html_body <> '' or text_body <> ''
            or message_headers <> '{}'::jsonb or last_error is not null)
        returning id`);
      return {
        sessionsDeleted: sessions.rowCount ?? 0,
        notificationsDeleted: notifications.rowCount ?? 0,
        emailDeliveriesRedacted: deliveries.rowCount ?? 0,
      };
    });
  } catch (error) {
    if (!discardedByCutover(error, "personal_data_retention")) throw error;
    return NOTHING_PURGED;
  }
}

/** Milliseconds until the next configured hour in America/Sao_Paulo. */
export const msUntilRetentionHour = (hour: number, now = new Date()): number => {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const [year, month, day] = date.split("-").map(Number);
  const [currentHour, minute, second] = clock.split(":").map(Number);
  const passed = currentHour! > hour || (currentHour === hour && (minute! > 0 || second! > 0));
  const target = new Date(Date.UTC(year!, month! - 1, passed ? day! + 1 : day!, hour + 3));
  return Math.max(1_000, target.getTime() - now.getTime());
};

export function startPersonalDataRetentionScheduler(): () => void {
  if (process.env.PERSONAL_DATA_RETENTION_DAILY === "false") {
    logger.info("Daily personal data retention is disabled");
    return () => undefined;
  }
  const config = personalDataRetentionConfig();
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const run = () =>
    void tryRunSingletonJob("personal_data_retention", () => purgeRetainedPersonalData(new Date(), config))
      .then((result) => {
        if (result.acquired) logger.info(result.value, "Personal data retention completed");
      })
      .catch((error) => logger.error({ err: error }, "Personal data retention failed"));
  const arm = () => {
    if (stopped) return;
    const delayMs = msUntilRetentionHour(config.hour);
    logger.info({ hour: config.hour, delayMs }, "Next personal data retention scheduled");
    timer = setTimeout(() => {
      run();
      arm();
    }, delayMs);
    timer.unref();
  };
  arm();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
