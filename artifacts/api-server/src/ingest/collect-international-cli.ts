import { logger } from "../lib/logger";
import { collectInternationalOnce } from "./international-client";
import { defaultInternationalFetch } from "./international-http";
import {
  internationalCounts,
  internationalCurrencies,
  internationalSourceSummary,
} from "./international-report";
import { fetchPtaxQuotes } from "./ptax-client";

const dryRun = process.env.INTERNATIONAL_DRY_RUN === "true";

const runDry = async () => {
  const sources = await collectInternationalOnce();
  const drafts = sources.flatMap((source) => source.drafts);
  const ptax = await fetchPtaxQuotes(internationalCurrencies(drafts), {
    fetcher: defaultInternationalFetch,
    now: new Date(),
  });
  return {
    sources: internationalSourceSummary(sources),
    counts: internationalCounts(drafts),
    ptax: { quotes: [...ptax.quotes.values()], errors: ptax.errors },
  };
};

const runStored = async () => {
  const [{ collectInternational }, { pool }] = await Promise.all([
    import("./collect-international"),
    import("@workspace/db"),
  ]);
  try {
    return await collectInternational();
  } finally {
    await pool.end();
  }
};

(dryRun ? runDry() : runStored())
  .then((result) => {
    logger.info(
      { result, dryRun },
      "International opportunities collection finished",
    );
  })
  .catch((error) => {
    logger.error(
      { err: error },
      "International opportunities collection failed",
    );
    process.exitCode = 1;
  });
