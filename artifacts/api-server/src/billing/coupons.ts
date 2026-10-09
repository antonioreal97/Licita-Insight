import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import {
  couponCodesTable,
  couponRedemptionsTable,
  db,
  subscriptionsTable,
  usersTable,
} from "@workspace/db";
import { ConflictError, ForbiddenError, InvalidParameterError } from "../lib/api-error";

export const COUPON_DURATIONS = [7, 30] as const;
export type CouponDurationDays = (typeof COUPON_DURATIONS)[number];

export type CouponView = {
  id: string;
  durationDays: CouponDurationDays;
  maxRedemptions: number;
  startsAt: string | null;
  expiresAt: string | null;
  redeemedCount: number;
  code: string;
};

export type CouponRedemptionView = {
  accessUntil: string;
  durationDays: CouponDurationDays;
  alreadyRedeemed: boolean;
};

const normalizeCode = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new InvalidParameterError("Informe um cupom válido.", [{ field: "code", issue: "required" }]);
  }
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{3,63}$/.test(code)) {
    throw new InvalidParameterError("Informe um cupom válido.", [{ field: "code", issue: "invalid" }]);
  }
  return code;
};

const hashCode = (code: string): string => createHash("sha256").update(code).digest("hex");

const generatedCode = (): string => `PARDAL-${randomBytes(8).toString("hex").toUpperCase()}`;

const invalidCoupon = (): InvalidParameterError =>
  new InvalidParameterError("Cupom inválido ou indisponível.", [{ field: "code", issue: "invalid_or_unavailable" }]);

const parseDuration = (value: unknown): CouponDurationDays => {
  const duration = Number(value);
  if (!COUPON_DURATIONS.includes(duration as CouponDurationDays)) {
    throw new InvalidParameterError("A duração do cupom deve ser 7 ou 30 dias.", [
      { field: "durationDays", issue: "must_be_7_or_30" },
    ]);
  }
  return duration as CouponDurationDays;
};

const parsePositiveInteger = (value: unknown, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
    throw new InvalidParameterError("O limite de uso do cupom é inválido.", [
      { field: "maxRedemptions", issue: "positive_integer" },
    ]);
  }
  return parsed;
};

const optionalDate = (value: unknown, field: string): Date | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new InvalidParameterError(`A data ${field} é inválida.`, [{ field, issue: "invalid_date" }]);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidParameterError(`A data ${field} é inválida.`, [{ field, issue: "invalid_date" }]);
  }
  return date;
};

export async function createCoupon(input: {
  code?: unknown;
  durationDays?: unknown;
  maxRedemptions?: unknown;
  startsAt?: unknown;
  expiresAt?: unknown;
}): Promise<CouponView> {
  const code = input.code === undefined ? generatedCode() : normalizeCode(input.code);
  const durationDays = parseDuration(input.durationDays);
  const maxRedemptions = parsePositiveInteger(input.maxRedemptions, 1);
  const startsAt = optionalDate(input.startsAt, "startsAt");
  const expiresAt = optionalDate(input.expiresAt, "expiresAt");
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    throw new InvalidParameterError("A expiração deve ser posterior ao início.", [
      { field: "expiresAt", issue: "after_starts_at" },
    ]);
  }
  const [duplicate] = await db
    .select({ id: couponCodesTable.id })
    .from(couponCodesTable)
    .where(eq(couponCodesTable.codeHash, hashCode(code)))
    .limit(1);
  if (duplicate) {
    throw new ConflictError("Esse código de cupom já existe.", [{ field: "code", issue: "already_exists" }]);
  }
  const [row] = await db
    .insert(couponCodesTable)
    .values({
      id: randomUUID(),
      codeHash: hashCode(code),
      codeLast4: code.slice(-4),
      durationDays,
      maxRedemptions,
      startsAt,
      expiresAt,
    })
    .returning();
  if (!row) throw new Error("Coupon was not created");
  return toCouponView(row, code);
}

/** Constant-time verification for the owner-only coupon issuance endpoint. */
export function assertCouponAdminToken(header: string | undefined): void {
  const expected = process.env.COUPON_ADMIN_TOKEN?.trim();
  if (!expected || !header) throw new ForbiddenError("Coupon administration is not enabled");
  const actual = Buffer.from(header);
  const target = Buffer.from(expected);
  if (actual.length !== target.length || !timingSafeEqual(actual, target)) {
    throw new ForbiddenError("Invalid coupon administration token");
  }
}

export async function redeemCoupon(userId: string, input: unknown, now = new Date()): Promise<CouponRedemptionView> {
  const code = normalizeCode(input && typeof input === "object" ? (input as { code?: unknown }).code : input);
  const hash = hashCode(code);
  return db.transaction(async (tx) => {
    const [coupon] = await tx
      .select()
      .from(couponCodesTable)
      .where(eq(couponCodesTable.codeHash, hash))
      .limit(1);
    if (!coupon) throw invalidCoupon();
    // Lock the coupon row for both the count check and the redemption insert.
    await tx.execute(sql`select 1 from ${couponCodesTable} where ${couponCodesTable.id} = ${coupon.id} for update`);
    const [existing] = await tx
      .select({ accessUntil: couponRedemptionsTable.accessUntil })
      .from(couponRedemptionsTable)
      .where(and(eq(couponRedemptionsTable.couponId, coupon.id), eq(couponRedemptionsTable.userId, userId)))
      .limit(1);
    if (existing) {
      return {
        accessUntil: existing.accessUntil.toISOString(),
        durationDays: coupon.durationDays as CouponDurationDays,
        alreadyRedeemed: true,
      };
    }
    if (
      coupon.revokedAt ||
      (coupon.startsAt && coupon.startsAt > now) ||
      (coupon.expiresAt && coupon.expiresAt <= now) ||
      coupon.redeemedCount >= coupon.maxRedemptions
    ) {
      throw invalidCoupon();
    }

    const [subscription, user] = await Promise.all([
      tx
        .select({ status: subscriptionsTable.status, currentPeriodEnd: subscriptionsTable.currentPeriodEnd })
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.userId, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      tx.select({ trialEndsAt: usersTable.trialEndsAt }).from(usersTable).where(eq(usersTable.id, userId)).limit(1).then((rows) => rows[0] ?? null),
    ]);
    const [existingCoupon] = await tx
      .select({ accessUntil: couponRedemptionsTable.accessUntil })
      .from(couponRedemptionsTable)
      .where(and(eq(couponRedemptionsTable.userId, userId), gt(couponRedemptionsTable.accessUntil, now)))
      .orderBy(desc(couponRedemptionsTable.accessUntil))
      .limit(1);
    const base = Math.max(
      now.getTime(),
      subscription?.currentPeriodEnd?.getTime() ?? 0,
      user?.trialEndsAt?.getTime() ?? 0,
      existingCoupon?.accessUntil.getTime() ?? 0,
    );
    const accessUntil = new Date(base + coupon.durationDays * 86_400_000);
    await tx
      .update(couponCodesTable)
      .set({ redeemedCount: sql`${couponCodesTable.redeemedCount} + 1` })
      .where(eq(couponCodesTable.id, coupon.id));
    await tx.insert(couponRedemptionsTable).values({ couponId: coupon.id, userId, accessUntil });
    return {
      accessUntil: accessUntil.toISOString(),
      durationDays: coupon.durationDays as CouponDurationDays,
      alreadyRedeemed: false,
    };
  });
}

export async function activeCouponAccessUntil(userId: string, now = new Date()): Promise<Date | null> {
  const [row] = await db
    .select({ accessUntil: couponRedemptionsTable.accessUntil })
    .from(couponRedemptionsTable)
    .innerJoin(couponCodesTable, eq(couponCodesTable.id, couponRedemptionsTable.couponId))
    .where(
      and(
        eq(couponRedemptionsTable.userId, userId),
        gt(couponRedemptionsTable.accessUntil, now),
        isNull(couponCodesTable.revokedAt),
      ),
    )
    .orderBy(desc(couponRedemptionsTable.accessUntil))
    .limit(1);
  return row?.accessUntil ?? null;
}

function toCouponView(row: typeof couponCodesTable.$inferSelect, code: string): CouponView {
  return {
    id: row.id,
    code,
    durationDays: row.durationDays as CouponDurationDays,
    maxRedemptions: row.maxRedemptions,
    redeemedCount: row.redeemedCount,
    startsAt: row.startsAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}
