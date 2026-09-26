import type { RequestHandler } from "express";

export const createReadinessHandler = (
  query: () => Promise<unknown>,
  timeoutMs = 2_000,
): RequestHandler => async (_req, res) => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      query(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("readiness timeout")), timeoutMs);
        timer.unref();
      }),
    ]);
    res.status(200).json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  } finally {
    if (timer) clearTimeout(timer);
  }
};
