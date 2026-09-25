import assert from "node:assert/strict";
import {
  buildSheetFields,
  SHEET_FIELDS,
} from "../dist/tender-sheet-policy.mjs";

const empty = buildSheetFields({}, {}, 0.5, 0.6);
assert.equal(empty.fields.length, 13);
assert.deepEqual(
  empty.fields.map(({ id }) => id),
  SHEET_FIELDS.map(({ id }) => id),
);
assert.ok(
  empty.fields.every(
    ({ status, answer, evidence }) =>
      status === "not_found" && answer === null && evidence === null,
  ),
);

const evidence = {
  documentTitle: "Edital.pdf",
  documentUrl: "https://pncp.gov.br/edital.pdf",
  page: 4,
  text: "É vedada a participação em consórcio.",
};
const unclear = buildSheetFields(
  { consortium: [{ noul: 0.98, evidence }] },
  { consortium: { answer: "forbidden", confidence: 0.59 } },
  0.5,
  0.6,
);
assert.deepEqual(unclear.fields[0], {
  id: "consortium",
  status: "found",
  answer: null,
  confidence: 0.59,
  evidence,
});
process.stdout.write("dist tender sheet policy: PASS\n");
