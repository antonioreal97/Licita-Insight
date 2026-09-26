import { Router, type IRouter, type RequestHandler } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export const createReadinessHandler =
  (
    query: () => Promise<unknown> = () => pool.query("select 1"),
    timeoutMs = 2_000,
  ): RequestHandler =>
  async (_req, res) => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        query(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("readiness timeout")),
            timeoutMs,
          );
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

router.get("/readyz", createReadinessHandler());

export default router;
