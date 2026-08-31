import assert from "node:assert/strict";
import test from "node:test";
import { canMutateCampaign, canViewCampaign, deniedCampaignAccess } from "./campaign-access.ts";

test("authenticated users can view submitted campaigns but not another owner's draft", () => {
  const common = { actorId: "viewer", createdBy: "owner", administrator: false, authenticated: true, production: true };
  assert.equal(canViewCampaign({ ...common, status: "submitted" }), true);
  assert.equal(canViewCampaign({ ...common, status: "approved" }), true);
  assert.equal(canViewCampaign({ ...common, status: "draft" }), false);
});

test("owners and administrators can view drafts while anonymous production users cannot", () => {
  assert.equal(canViewCampaign({ status: "draft", actorId: "owner", createdBy: "owner", administrator: false, authenticated: true, production: true }), true);
  assert.equal(canViewCampaign({ status: "draft", actorId: "admin", createdBy: "owner", administrator: true, authenticated: true, production: true }), true);
  assert.equal(canViewCampaign({ status: "submitted", actorId: "public", createdBy: "owner", administrator: false, authenticated: false, production: true }), false);
});

test("production campaign mutations are owner or administrator only", () => {
  const common = { createdBy: "owner", authenticated: true, production: true };
  assert.equal(canMutateCampaign({ ...common, actorId: "owner", administrator: false }), true);
  assert.equal(canMutateCampaign({ ...common, actorId: "unrelated", administrator: false }), false);
  assert.equal(canMutateCampaign({ ...common, actorId: "admin", administrator: true }), true);
  assert.equal(canMutateCampaign({ ...common, actorId: "anonymous", administrator: false, authenticated: false }), false);
});

test("development preserves public mutation behavior", () => {
  assert.equal(canMutateCampaign({
    actorId: "development-actor", createdBy: "owner", administrator: false, authenticated: false, production: false,
  }), true);
});

test("unrelated production actors receive the same 403 denial without object detail leakage", () => {
  const denial = deniedCampaignAccess({ authenticated: true, production: true });
  assert.deepEqual(denial, { status: 403, body: { error: "Campaign access denied" } });
  for (const resource of ["campaign", "cost", "planning-period", "activity", "execution", "execution-copy", "execution-version"]) {
    assert.deepEqual(deniedCampaignAccess({ authenticated: true, production: true }), denial, resource);
  }
});