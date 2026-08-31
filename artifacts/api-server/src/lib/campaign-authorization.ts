import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { campaignsTable, db, taxonomyUserRolesTable } from "@workspace/db";
import { getAuditActor } from "../middlewares/mutation-auth";
import { canMutateCampaign, canViewCampaign, deniedCampaignAccess } from "./campaign-access";

export async function isCampaignAdministrator(actorId: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
  const [access] = await db.select({ role: taxonomyUserRolesTable.role })
    .from(taxonomyUserRolesTable).where(eq(taxonomyUserRolesTable.userId, actorId));
  return access?.role === "administrator";
}

export async function requireCampaignAccess(
  req: Request,
  res: Response,
  campaign: typeof campaignsTable.$inferSelect,
  mode: "view" | "mutate",
): Promise<boolean> {
  const actorId = getAuditActor(req);
  const administrator = await isCampaignAdministrator(actorId);
  const authenticated = Boolean(req.user?.id);
  const production = process.env.NODE_ENV === "production";
  const allowed = mode === "mutate"
    ? canMutateCampaign({ actorId, createdBy: campaign.createdBy, administrator, authenticated, production })
    : canViewCampaign({ status: campaign.status, actorId, createdBy: campaign.createdBy, administrator, authenticated, production });
  if (allowed) return true;
  const denial = deniedCampaignAccess({ authenticated, production });
  res.status(denial.status).json(denial.body);
  return false;
}

export async function requireAdministrator(req: Request, res: Response): Promise<boolean> {
  if (await isCampaignAdministrator(getAuditActor(req))) return true;
  res.status(403).json({ error: "Campaign access denied" });
  return false;
}