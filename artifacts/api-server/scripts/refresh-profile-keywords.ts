import { pool } from "@workspace/db";
import { rebuildProfileKeywordVocabulary } from "../src/profile/keyword-vocabulary";

try {
  console.log(JSON.stringify(await rebuildProfileKeywordVocabulary(), null, 2));
} finally {
  await pool.end();
}
