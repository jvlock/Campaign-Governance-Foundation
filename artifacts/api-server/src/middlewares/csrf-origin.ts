import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || req.headers.authorization?.startsWith("Bearer ")) {
    next();
    return;
  }
  const origin = req.headers.origin;
  const expectedHost = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
  if (!origin) {
    res.status(403).json({ error: "Origin header required" });
    return;
  }
  try {
    if (new URL(origin).host !== expectedHost) {
      res.status(403).json({ error: "Cross-origin mutation denied" });
      return;
    }
  } catch {
    res.status(403).json({ error: "Invalid origin" });
    return;
  }
  next();
}