import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Recorded Mapas Culturais responses. See `fixtures/mapas/README.md` for where each one came from. */
export const mapasFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/mapas/${name}`, import.meta.url)),
    "utf8",
  );
