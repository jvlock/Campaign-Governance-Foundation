import type { Request, Response, NextFunction } from "express";

export function getAuditActor(req: Request): string {
  if (process.env.NODE_ENV === "production" && req.user?.id) {
    return req.user.id;
  }
  return "public";
}

export function requireMutationAuth(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET") {
    return next();
  }
  if (process.env.NODE_ENV === "production" && !req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
