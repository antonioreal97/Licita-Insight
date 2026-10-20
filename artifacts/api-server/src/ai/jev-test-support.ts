import { zstdDecompressSync } from "node:zlib";

// The TypeSafe SDK zstd-compresses request bodies of 1 KiB or more; mocks read them back as JSON.
export const jevRequestBody = (init?: RequestInit): unknown => {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const encoding = Object.entries(headers).find(([name]) => name.toLowerCase() === "content-encoding")?.[1];
  const text = encoding === "zstd"
    ? zstdDecompressSync(init?.body as Uint8Array).toString("utf8")
    : String(init?.body);
  return JSON.parse(text);
};
