import { Router, type IRouter } from "express";
import { asyncHandler, authContext, requireAuth } from "../auth/http";
import { requireSubscription } from "../billing/require-subscription";
import { InvalidParameterError } from "../lib/api-error";
import {
  countOpenTendersMatchingProfile,
  listProfileCategories,
  suggestProfileKeywords,
  suggestionsFromDescription,
} from "../profile/keyword-vocabulary";
import { listProfilePlatforms } from "../profile/platform-options";
import { getCompanyProfile } from "../ai/company-fit-service";
import { searchMunicipalities } from "../service-region/service-region";
import { countOpenTendersInServiceRegion } from "../service-region/service-region-service";
import { isWorkspaceId } from "../workspaces/workspace-service";

const router: IRouter = Router();

router.get(
  "/v1/profile/municipalities",
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const state =
      typeof req.query.state === "string"
        ? req.query.state.trim().toUpperCase()
        : undefined;
    if (query.length < 2 || query.length > 80) {
      throw new InvalidParameterError(
        "q must contain between 2 and 80 characters",
        [{ field: "q", issue: "invalid_length" }],
      );
    }
    res.json({ data: searchMunicipalities(query, state) });
  }),
);

router.get(
  "/v1/me/company-profile/region-preview",
  requireAuth,
  requireSubscription,
  asyncHandler(async (req, res) => {
    const rawWorkspaceId = req.query.workspaceId;
    if (rawWorkspaceId !== undefined && (typeof rawWorkspaceId !== "string" || !isWorkspaceId(rawWorkspaceId))) {
      throw new InvalidParameterError("workspaceId is invalid", [{ field: "workspaceId", issue: "invalid_value" }]);
    }
    const profile = await getCompanyProfile(authContext(res).user.id, rawWorkspaceId as string | undefined);
    res.json({
      count: profile
        ? await countOpenTendersInServiceRegion(profile.coverage)
        : 0,
    });
  }),
);

router.get(
  "/v1/profile/categories",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ data: await listProfileCategories() });
  }),
);

router.get(
  "/v1/profile/platforms",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ data: await listProfilePlatforms() });
  }),
);

router.get(
  "/v1/profile/keywords/suggest",
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2 || query.length > 80) {
      throw new InvalidParameterError(
        "q must contain between 2 and 80 characters",
        [{ field: "q", issue: "invalid_length" }],
      );
    }
    res.json({ data: await suggestProfileKeywords(query, 10) });
  }),
);

router.post(
  "/v1/profile/keywords/from-description",
  requireAuth,
  asyncHandler(async (req, res) => {
    const description =
      typeof req.body?.description === "string"
        ? req.body.description.trim()
        : "";
    if (description.length < 20 || description.length > 600) {
      throw new InvalidParameterError(
        "description must contain between 20 and 600 characters",
        [{ field: "description", issue: "invalid_length" }],
      );
    }
    res.json(await suggestionsFromDescription(description));
  }),
);

const stringList = (
  value: unknown,
  field: string,
  max: number,
  maxLength: number,
): string[] => {
  if (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= max &&
      value.every(
        (item) =>
          typeof item === "string" &&
          item.trim().length > 0 &&
          item.trim().length <= maxLength,
      ))
  )
    return ((value as string[] | undefined) ?? []).map((item) => item.trim());
  throw new InvalidParameterError(`${field} is invalid`, [
    { field, issue: "invalid_value" },
  ]);
};

/** Live "≈ N editais abertos" for the profile form: the terms and categories being edited, before saving. */
router.post(
  "/v1/profile/match-preview",
  requireAuth,
  asyncHandler(async (req, res) => {
    const terms = stringList(req.body?.terms, "terms", 40, 80);
    const categories = stringList(req.body?.categories, "categories", 20, 80);
    res.json({
      estimatedOpenTenderCount: await countOpenTendersMatchingProfile({
        terms,
        categories,
      }),
    });
  }),
);

export default router;
