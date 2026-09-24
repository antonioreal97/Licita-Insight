import { Router, type IRouter } from "express";
import { asyncHandler, authContext, requireAuth, requireCsrf } from "../auth/http";
import {
  applyAsaasWebhook,
  cancelSubscription,
  getBilling,
  getBillingPlan,
  startCheckout,
} from "../billing/billing-service";
import { assertAsaasWebhookToken } from "../billing/webhook-token";

const router: IRouter = Router();

router.get("/v1/billing/plan", (_req, res) => {
  res.json(getBillingPlan());
});

router.post(
  "/v1/billing/asaas/webhook",
  asyncHandler(async (req, res) => {
    assertAsaasWebhookToken(req.header("asaas-access-token"));
    await applyAsaasWebhook(req.body);
    res.status(200).json({ received: true });
  }),
);

router.get(
  "/v1/me/billing",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await getBilling(authContext(res).user.id));
  }),
);

router.post(
  "/v1/me/billing/checkout",
  requireAuth,
  requireCsrf,
  asyncHandler(async (_req, res) => {
    res.json(await startCheckout(authContext(res).user.id));
  }),
);

router.post(
  "/v1/me/billing/cancel",
  requireAuth,
  requireCsrf,
  asyncHandler(async (_req, res) => {
    res.json(await cancelSubscription(authContext(res).user.id));
  }),
);

export default router;
