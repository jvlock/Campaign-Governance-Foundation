export function canViewCampaign(input: {
  status: string;
  actorId: string;
  createdBy: string;
  administrator: boolean;
  authenticated: boolean;
  production: boolean;
}): boolean {
  if (!input.production) return true;
  if (!input.authenticated) return false;
  return input.status !== "draft" || input.createdBy === input.actorId || input.administrator;
}

export function canMutateCampaign(input: {
  actorId: string;
  createdBy: string;
  administrator: boolean;
  authenticated: boolean;
  production: boolean;
}): boolean {
  return !input.production || (input.authenticated && (input.createdBy === input.actorId || input.administrator));
}

export function deniedCampaignAccess(input: { authenticated: boolean; production: boolean }) {
  return input.production && !input.authenticated
    ? { status: 401, body: { error: "Authentication required" } }
    : { status: 403, body: { error: "Campaign access denied" } };
}