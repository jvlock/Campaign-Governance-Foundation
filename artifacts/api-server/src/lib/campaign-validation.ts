export const CAMPAIGN_TYPES = [
  "integrated", "activation", "nurture", "event", "research_content", "paid_media",
  "sales_cadence", "client_expansion", "newsletter", "in_app", "approved_other",
] as const;

export const PRODUCT_ROLES = [
  "primary_solution", "supporting_capability", "cross_sell", "upsell", "proof_point",
  "content_data_source", "cta_destination", "internal_relevance",
] as const;

export type CampaignIssue = { code: string; severity: "warning" | "error"; message: string; step: number };
type Audience = { dimension: string; valueId?: string | null; rawValue?: string | null; isPrimary: boolean };
type Product = { productId: string; role: string };
type Input = {
  name: string; campaignType?: string; hierarchyKind: string; parentId?: string | null; startDate?: string | null; endDate?: string | null;
  audiences: Audience[]; products: Product[]; promotedProductIds?: string[]; planningEstimate?: number | null;
};

const catchAll = /^(other|others|all|mixed(?:-title)?|other\s*\/\s*mixed-title)$/i;

export function normalizeCampaignName(name: string) {
  return name.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function validateCampaign(input: Input): CampaignIssue[] {
  const issues: CampaignIssue[] = [];
  const requiredKinds: Record<string, string> = {
    nurture: "journey", event: "event",
    sales_cadence: "sales_cadence", newsletter: "newsletter",
  };
  const campaignType = input.campaignType;
  if (campaignType && requiredKinds[campaignType] && input.hierarchyKind !== requiredKinds[campaignType]) {
    issues.push({ code: "type_hierarchy", severity: "error", message: `${campaignType.replaceAll("_", " ")} must use the ${requiredKinds[campaignType].replaceAll("_", " ")} hierarchy type.`, step: 1 });
  }
  const segments = input.audiences.filter((a) => a.dimension === "segment_family");
  if (segments.filter((a) => a.isPrimary).length !== 1) {
    issues.push({ code: "primary_segment", severity: "error", message: "Choose exactly one primary segment.", step: 3 });
  }
  if (!input.audiences.some((a) => a.dimension === "persona" && !catchAll.test(a.rawValue ?? ""))) {
    issues.push({ code: "meaningful_persona", severity: "warning", message: "Add at least one meaningful governed persona; catch-all labels are not personas.", step: 3 });
  }
  for (const audience of input.audiences) {
    if (audience.rawValue && catchAll.test(audience.rawValue)) {
      issues.push({ code: "unresolved_classification", severity: "error", message: `${audience.rawValue} must be resolved through governance or recorded as a deliberate execution consolidation.`, step: 3 });
    }
  }
  const productIds = input.products.map((p) => p.productId);
  if (new Set(productIds).size !== productIds.length) {
    issues.push({ code: "duplicate_product", severity: "error", message: "A product or capability can be associated only once.", step: 5 });
  }
  if (input.products.length && !input.products.some((p) => p.role === "primary_solution")) {
    issues.push({ code: "primary_solution", severity: "warning", message: "No primary solution is identified.", step: 5 });
  }
  if ((input.promotedProductIds ?? []).some((id) => !productIds.includes(id))) {
    issues.push({ code: "promoted_subset", severity: "error", message: "Activities may promote only products associated with the parent campaign.", step: 5 });
  }
  if (input.hierarchyKind === "activity" && !input.parentId) {
    issues.push({ code: "activity_parent", severity: "error", message: "An activity must be related to an existing campaign, wave, journey, event, or sales cadence.", step: 2 });
  }
  if (input.hierarchyKind === "wave" && !input.parentId) {
    issues.push({ code: "wave_parent", severity: "error", message: "A wave must be related to an existing campaign.", step: 2 });
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    issues.push({ code: "date_range", severity: "error", message: "End date cannot be before start date.", step: 7 });
  }
  if (input.planningEstimate != null) {
    if (input.planningEstimate < 25) issues.push({ code: "audience_too_small", severity: "warning", message: "Planning estimate is very small; confirm channel viability.", step: 3 });
    if (input.planningEstimate > 1_000_000) issues.push({ code: "audience_too_broad", severity: "warning", message: "Planning estimate is unusually broad; refine the audience.", step: 3 });
  }
  const hasCountry = input.audiences.some((a) => a.dimension === "country");
  const hasRegion = input.audiences.some((a) => a.dimension === "region");
  if (hasCountry && !hasRegion) issues.push({ code: "geography_inconsistent", severity: "warning", message: "A country is selected without its region.", step: 3 });
  return issues;
}

export function allowedParent(childKind: string, parentKind: string) {
  const rules: Record<string, string[]> = {
    wave: ["campaign"],
    activity: ["campaign", "wave", "journey", "event", "sales_cadence", "newsletter"],
    journey: ["campaign"],
    event: ["campaign", "wave"],
    sales_cadence: ["campaign"],
    newsletter: ["campaign"],
  };
  return !rules[childKind] || rules[childKind].includes(parentKind);
}