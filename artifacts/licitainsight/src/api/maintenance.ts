import { isApiError, type ApiError } from './errors';

/** Copy fixed by the cutover contract for `503 MAINTENANCE_IN_PROGRESS` (docs/contracts/workspace-cutover-v1.md). */
export const MAINTENANCE_TITLE = 'Manutenção rápida em andamento';
export const MAINTENANCE_DETAIL = 'Tente de novo em alguns minutos.';
export const MAINTENANCE_MESSAGE = `${MAINTENANCE_TITLE}. ${MAINTENANCE_DETAIL}`;

/** Only writes get this answer and reads keep working, so it is a notice on the action, never an outage of the app. */
export const isMaintenance = (error: unknown): error is ApiError => isApiError(error) && error.code === 'MAINTENANCE_IN_PROGRESS';

const BURST_MS = 1_000;

/** How long the notice stays up: the `Retry-After` the API sent, between 5 and 30 seconds. */
export const maintenanceNoticeMs = (error: ApiError): number => Math.min(30, Math.max(5, error.retryAfterSeconds ?? 30)) * 1_000;

export type MaintenanceNotice = { title: string; description: string; duration: number };

/**
 * One notice at a time. Requests refused together announce once, and a later attempt replaces the notice still on
 * screen instead of stacking another. Returns whether the error was the maintenance answer.
 */
export function createMaintenanceNotifier(show: (notice: MaintenanceNotice) => { dismiss: () => void }) {
  let shown: { dismiss: () => void } | null = null;
  let shownAt = -Infinity;
  return (error: unknown, now = Date.now()): boolean => {
    if (!isMaintenance(error)) return false;
    if (now - shownAt < BURST_MS) return true;
    shown?.dismiss();
    shownAt = now;
    shown = show({ title: MAINTENANCE_TITLE, description: MAINTENANCE_DETAIL, duration: maintenanceNoticeMs(error) });
    return true;
  };
}
