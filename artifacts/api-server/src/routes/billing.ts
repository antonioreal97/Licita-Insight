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
import {
  assertCouponAdminToken,
  createCoupon,
  redeemCoupon,
} from "../billing/coupons";

const router: IRouter = Router();

router.get("/v1/billing/plan", (_req, res) => {
  res.json(getBillingPlan());
});

/** Owner-only issuance endpoint. The plaintext code is returned only in this response. */
router.post(
  "/v1/billing/coupons",
  asyncHandler(async (req, res) => {
    assertCouponAdminToken(req.header("x-coupon-admin-token"));
    res.status(201).json(await createCoupon(req.body));
  }),
);

router.post(
  "/v1/me/billing/coupon",
  requireAuth,
  requireCsrf,
  asyncHandler(async (req, res) => {
    res.json(await redeemCoupon(authContext(res).user.id, req.body));
  }),
);

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
