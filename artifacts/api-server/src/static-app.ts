import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";

const isInside = (root: string, candidate: string): boolean =>
  candidate === root || candidate.startsWith(`${root}${path.sep}`);

export const createStaticApp = (staticDir: string): RequestHandler => {
  const root = fs.realpathSync(path.resolve(staticDir));
  const indexPath = fs.realpathSync(path.join(root, "index.html"));
  // Vite writes every content-hashed file to assets/; public/ files (logo, favicon) keep their names.
  const hashedAssetsDir = path.join(root, "assets");
  if (!isInside(root, indexPath)) {
    throw new Error("STATIC_DIR index.html must stay inside STATIC_DIR");
  }

  return (req, res, next) => {
    if (req.method !== "GET" || req.path === "/api" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(req.path);
    } catch {
      next();
      return;
    }
    if (pathname.includes("\0")) {
      next();
      return;
    }

    const candidate = path.resolve(root, `.${pathname}`);
    if (!isInside(root, candidate)) {
      next();
      return;
    }

    let filePath = indexPath;
    try {
      const realCandidate = fs.realpathSync(candidate);
      if (isInside(root, realCandidate) && fs.statSync(realCandidate).isFile()) {
        filePath = realCandidate;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        next(error);
        return;
      }
    }

    res.setHeader(
      "Cache-Control",
      filePath !== indexPath && isInside(hashedAssetsDir, filePath)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
    res.sendFile(filePath, (error) => {
      if (error) next(error);
    });
  };
};
