import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import { requestContext } from "./middlewares/request-context";
import { createRequestProtection } from "./middlewares/request-protection";
import { httpMetricsMiddleware } from "./metrics";

const app: Express = express();

const trustProxy = process.env.TRUST_PROXY?.trim();
if (trustProxy && trustProxy !== "false") {
  app.set("trust proxy", trustProxy === "true" ? true : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

app.use(requestContext);
app.use(httpMetricsMiddleware);
app.use(
  pinoHttp({
    logger,
    genReqId(_req, res) {
      return res.locals.requestId;
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression({ threshold: 1024 }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(createRequestProtection());
const bodyLimit = process.env.REQUEST_BODY_LIMIT?.trim() || "256kb";
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

app.use("/api", router);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
