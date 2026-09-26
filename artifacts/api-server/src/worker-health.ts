import express, { type Express } from "express";
import healthRouter from "./routes/health";

export const createWorkerHealthApp = (): Express => {
  const app = express();
  app.use("/api", healthRouter);
  return app;
};
