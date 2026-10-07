export type NotificationJobSchedule = {
  databaseAvailable: boolean;
  emailDeliveryEnabled: boolean;
  savedSearchEvaluation: boolean;
  profileAlertEvaluation: boolean;
  immediateEmail: boolean;
  emailDigest: boolean;
  emailRetries: boolean;
};

export function resolveNotificationJobSchedule(
  env: NodeJS.ProcessEnv = process.env,
): NotificationJobSchedule {
  const databaseAvailable = Boolean(env.DATABASE_URL?.trim());
  const emailDeliveryEnabled = env.EMAIL_JOBS_ENABLED !== "false";
  return {
    databaseAvailable,
    emailDeliveryEnabled,
    savedSearchEvaluation: databaseAvailable,
    profileAlertEvaluation: databaseAvailable,
    immediateEmail: databaseAvailable && emailDeliveryEnabled,
    emailDigest: databaseAvailable && emailDeliveryEnabled,
    emailRetries: databaseAvailable && emailDeliveryEnabled,
  };
}
