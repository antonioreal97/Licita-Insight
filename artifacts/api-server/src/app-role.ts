export type AppRole = "all" | "api" | "worker";

export const appRoleFromEnv = (
  raw = process.env.APP_ROLE,
): AppRole => {
  const role = raw?.trim() || "all";
  if (role === "all" || role === "api" || role === "worker") return role;
  throw new Error(`APP_ROLE must be one of all, api or worker; received "${role}"`);
};

export const roleServesApi = (role: AppRole): boolean => role !== "worker";
export const roleRunsJobs = (role: AppRole): boolean => role !== "api";
