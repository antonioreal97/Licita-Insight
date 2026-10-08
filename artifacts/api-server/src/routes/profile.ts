import { Router, type IRouter } from "express";
import { asyncHandler, requireAuth } from "../auth/http";
import { InvalidParameterError } from "../lib/api-error";
import {
  listProfileCategories,
  suggestProfileKeywords,
  suggestionsFromDescription,
} from "../profile/keyword-vocabulary";

const router: IRouter = Router();

router.get(
  "/v1/profile/categories",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ data: await listProfileCategories() });
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

export default router;
