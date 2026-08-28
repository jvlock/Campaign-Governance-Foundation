import type { Request, Response, NextFunction } from "express";
import { db, taxonomyUserRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function getAuditActor(req: Request): string {
  if (process.env.NODE_ENV === "production" && req.user?.id) {
    return req.user.id;
  }
  return "public";
}

/** Configuration changes are governance administration, unlike the public draft workflow. */
export async function requireConfigurationAdministrator(req: Request, res: Response): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
  if (!req.user?.id) { res.status(401).json({ error: "Authentication required" }); return false; }
  const [role] = await db.select().from(taxonomyUserRolesTable)
    .where(eq(taxonomyUserRolesTable.userId, req.user.id));
  if (role?.role !== "administrator") { res.status(403).json({ error: "Configuration administration requires administrator role" }); return false; }
  return true;
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
