import { timingSafeEqual } from "node:crypto";
import { UnauthenticatedError } from "../lib/api-error";

export function webhookTokenMatches(provided: string | undefined): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function assertAsaasWebhookToken(header: string | undefined): void {
  if (!webhookTokenMatches(header)) {
    throw new UnauthenticatedError("Invalid Asaas webhook token");
  }
}
