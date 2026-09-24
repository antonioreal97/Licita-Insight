import { createHmac } from "node:crypto";

export const TRIAL_DAYS = 7;
export const TRIAL_ENDING_NOTICE_DAYS = 3;

export const trialEndsAtFrom = (startedAt: Date): Date =>
  new Date(startedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

export const googleTrialSubjectHash = (
  googleSub: string,
  secret: string,
): string =>
  createHmac("sha256", secret)
    .update("licitai:google-trial:v1\0")
    .update(googleSub)
    .digest("hex");
