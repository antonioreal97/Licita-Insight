/**
 * Rebuild materialized recommendations for every user with the current scoring rules.
 * Safe to run in the API container after deploy when existing rows were scored with older criteria.
 */
import { runDailyRecommendations } from "../src/recommendations/recommendation-service";

const result = await runDailyRecommendations();
console.log(
  JSON.stringify(
    {
      users: result.users,
      recommendations: result.recommendations,
      deletedEvents: result.deletedEvents,
      deletedImpressions: result.deletedImpressions,
    },
    null,
    2,
  ),
);
