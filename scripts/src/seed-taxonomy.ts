import { and, eq } from "drizzle-orm";
import {
  db,
  accountSizeRulesTable,
  audienceEvidenceTable,
  governedValuesTable,
  taxonomyAssociationsTable,
  taxonomyAuditEventsTable,
  taxonomyCategoriesTable,
  messagingCohortVersionsTable,
} from "@workspace/db";

const categoryNames: Array<[string, string, boolean, boolean]> = [
  ["strategic_program", "Strategic program", true, false],
  ["segment", "Segment", true, false],
  ["subsegment", "Subsegment", true, false],
  ["account_size_tier", "Account size tier", false, true],
  ["account_priority_tier", "Account priority tier", false, false],
  ["relationship", "Relationship", false, false],
  ["buying_group_function", "Buying group function", true, false],
  ["persona", "Persona", true, false],
  ["seniority_level", "Seniority level", true, false],
  ["messaging_cohort", "Messaging cohort", true, false],
  ["behavioral_cohort", "Behavioral cohort", false, false],
  ["audience_origin", "Audience origin / targeting method", false, false],
  ["product", "Product", true, false],
  ["product_family", "Product family", true, false],
  ["capability_solution", "Capability / solution", true, false],
  ["customer_need", "Customer need", true, false],
  ["campaign_type", "Campaign type", true, false],
  ["business_objective", "Business objective", true, true],
  ["commercial_motion", "Commercial motion", true, false],
  ["marketing_objective", "Marketing objective", true, true],
  ["primary_conversion", "Primary conversion", true, true],
  ["journey_stage", "Journey stage", true, true],
  ["region", "Region", true, false],
  ["subregion", "Subregion", true, false],
  ["country", "Country", true, false],
  ["market_cluster", "Market cluster", true, false],
  ["language", "Language", true, false],
  ["channel", "Channel", true, true],
  ["source", "Source", true, true],
  ["delivery_mechanism", "Delivery mechanism", true, true],
  ["platform", "Platform", true, false],
  ["activity_type", "Activity type", true, true],
  ["creative_format", "Creative format", true, false],
  ["call_to_action", "Call to action", true, true],
  ["campaign_member_status_template", "Campaign member status template", true, true],
  ["fiscal_calendar", "Fiscal calendar", true, false],
  ["fiscal_year", "Fiscal year", true, false],
  ["fiscal_quarter", "Fiscal quarter", true, false],
  ["fiscal_period", "Fiscal period", true, false],
  ["currency", "Currency", true, false],
  ["cost_center", "Cost center", true, false],
];

const valueSeeds: Array<{
  key: string;
  category: string;
  name: string;
  definition: string;
  parent?: string;
  measurementRule?: string;
  legacy?: string[];
}> = [
  { key: "PROGRAM_GLOBAL_DEMAND", category: "strategic_program", name: "Global demand program", definition: "Draft strategic program grouping demand generation work across markets." },
  { key: "SEGMENT_ENTERPRISE", category: "segment", name: "Enterprise", definition: "Draft segment for organizations meeting the governed enterprise qualification criteria." },
  { key: "SEGMENT_ASSET_OWNERS", category: "segment", name: "Asset Owners", definition: "Organizations that own and oversee institutional investment assets; sourced from the preserved audience workbook." },
  { key: "SEGMENT_HEDGE_FUNDS", category: "segment", name: "Hedge Funds", definition: "Investment firms operating hedge fund strategies; sourced from the preserved audience workbook." },
  { key: "SUBSEGMENT_PRIVATE_INSTITUTIONS", category: "subsegment", name: "Private Institutions", definition: "Asset Owner private institutions represented in the preserved audience workbook.", parent: "SEGMENT_ASSET_OWNERS" },
  { key: "SUBSEGMENT_GLOBAL_ENTERPRISE", category: "subsegment", name: "Global enterprise", definition: "Draft enterprise subsegment for organizations operating across multiple regions.", parent: "SEGMENT_ENTERPRISE" },
  { key: "ACCOUNT_TIER_1000_PLUS", category: "account_size_tier", name: "1,000+ employees", definition: "Draft account-size tier measured by current employee count.", measurementRule: "employee_count >= 1000" },
  { key: "ACCOUNT_SIZE_LARGE", category: "account_size_tier", name: "Large", definition: "Size tier whose threshold must be interpreted using its segment-specific account-size rule.", measurementRule: "See versioned account_size_rules for segment basis and thresholds" },
  { key: "ACCOUNT_SIZE_MEDIUM", category: "account_size_tier", name: "Medium", definition: "Size tier whose threshold must be interpreted using its segment-specific account-size rule.", measurementRule: "See versioned account_size_rules for segment basis and thresholds" },
  { key: "ACCOUNT_SIZE_SMALL", category: "account_size_tier", name: "Small", definition: "Size tier whose threshold must be interpreted using its segment-specific account-size rule.", measurementRule: "See versioned account_size_rules for segment basis and thresholds" },
  { key: "PRIORITY_TIER_1", category: "account_priority_tier", name: "Priority 1", definition: "Highest governed execution priority, independent of account size." },
  { key: "RELATIONSHIP_PROSPECT", category: "relationship", name: "Prospect", definition: "Organization or person with no current client relationship." },
  { key: "BUYING_FUNCTION_FINANCE", category: "buying_group_function", name: "Finance", definition: "Draft buying-group function responsible for financial planning and control." },
  { key: "PERSONA_CFO", category: "persona", name: "Chief financial officer", definition: "Draft executive finance persona accountable for financial strategy.", parent: "BUYING_FUNCTION_FINANCE" },
  { key: "PERSONA_FINANCE_EXECUTIVE", category: "persona", name: "Finance & Executive Leadership", definition: "Canonical Asset Owner persona mapped from preserved representative-title evidence.", parent: "BUYING_FUNCTION_FINANCE" },
  { key: "PERSONA_BUSINESS_LEADERSHIP", category: "persona", name: "Business Leadership", definition: "Canonical Hedge Fund leadership persona mapped from preserved representative-title evidence." },
  { key: "SENIORITY_C_LEVEL", category: "seniority_level", name: "C-level", definition: "Draft seniority level for chief officers and equivalent executives." },
  { key: "COHORT_EFFICIENCY_LEADERS", category: "messaging_cohort", name: "Efficiency leaders", definition: "Governed messaging cohort prioritizing operating efficiency outcomes." },
  { key: "COHORT_AO_FINANCE_EXECUTIVE_LEADERSHIP", category: "messaging_cohort", name: "Asset Owner Finance & Executive Leadership", definition: "Versioned treatment backed by Asset Owner workbook evidence." },
  { key: "COHORT_HF_BUSINESS_LEADERSHIP", category: "messaging_cohort", name: "Hedge Fund Business Leadership", definition: "Versioned treatment backed by Hedge Fund workbook evidence." },
  { key: "PRODUCT_AUTOMATION", category: "product", name: "Automation", definition: "Draft product value representing the automation offering.", parent: "PRODUCT_FAMILY_PLATFORM" },
  { key: "PRODUCT_FAMILY_PLATFORM", category: "product_family", name: "Platform", definition: "Draft product family grouping core platform offerings." },
  { key: "CAPABILITY_WORKFLOW_AUTOMATION", category: "capability_solution", name: "Workflow automation", definition: "Draft capability for orchestrating repeatable workflows.", parent: "PRODUCT_AUTOMATION" },
  { key: "NEED_REDUCE_MANUAL_WORK", category: "customer_need", name: "Reduce manual work", definition: "Draft customer need focused on eliminating repetitive work." },
  { key: "CAMPAIGN_TYPE_INTEGRATED", category: "campaign_type", name: "Integrated campaign", definition: "Draft campaign type coordinated across multiple governed channels." },
  { key: "BUSINESS_OBJECTIVE_PIPELINE", category: "business_objective", name: "Create qualified pipeline", definition: "Draft business objective to generate qualified commercial opportunities.", measurementRule: "qualified_pipeline_amount" },
  { key: "MOTION_NEW_LOGO", category: "commercial_motion", name: "New logo acquisition", definition: "Draft commercial motion focused on acquiring new customers." },
  { key: "MARKETING_OBJECTIVE_DEMAND", category: "marketing_objective", name: "Generate demand", definition: "Draft marketing objective to create and capture qualified demand.", measurementRule: "qualified_response_count" },
  { key: "CONVERSION_DEMO_REQUEST", category: "primary_conversion", name: "Demo request", definition: "Draft primary conversion completed when a prospect requests a demonstration.", measurementRule: "demo_request_submitted = true" },
  { key: "JOURNEY_CONSIDERATION", category: "journey_stage", name: "Consideration", definition: "Draft journey stage where buyers actively evaluate approaches and providers.", measurementRule: "engagement_score >= consideration_threshold" },
  { key: "REGION_NORTH_AMERICA", category: "region", name: "North America", definition: "Draft geographic region covering governed North American markets.", legacy: ["NA_REGION"] },
  { key: "SUBREGION_NORTHERN_AMERICA", category: "subregion", name: "Northern America", definition: "Draft subregion within North America.", parent: "REGION_NORTH_AMERICA" },
  { key: "COUNTRY_US", category: "country", name: "United States", definition: "Draft country value for the United States.", parent: "SUBREGION_NORTHERN_AMERICA", legacy: ["US", "USA"] },
  { key: "MARKET_CLUSTER_US_ENGLISH", category: "market_cluster", name: "United States — English", definition: "Draft market cluster for English-language United States programs.", parent: "COUNTRY_US" },
  { key: "LANGUAGE_ENGLISH", category: "language", name: "English", definition: "Draft governed language value for English.", legacy: ["en"] },
  { key: "CHANNEL_PAID_SOCIAL", category: "channel", name: "Paid social", definition: "Draft paid channel using sponsored placements on social platforms.", measurementRule: "utm_medium = paid_social" },
  { key: "CHANNEL_EMAIL", category: "channel", name: "Email", definition: "Governed email delivery channel." },
  { key: "CHANNEL_EVENT", category: "channel", name: "Event", definition: "Governed event delivery channel." },
  { key: "CHANNEL_SALES_OUTREACH", category: "channel", name: "Sales outreach", definition: "Governed sales outreach channel." },
  { key: "SOURCE_LINKEDIN", category: "source", name: "LinkedIn", definition: "Draft traffic and response source for LinkedIn.", parent: "CHANNEL_PAID_SOCIAL", measurementRule: "utm_source = linkedin" },
  { key: "DELIVERY_SPONSORED_CONTENT", category: "delivery_mechanism", name: "Sponsored content", definition: "Draft delivery mechanism for sponsored feed content.", parent: "SOURCE_LINKEDIN", measurementRule: "placement_type = sponsored_content" },
  { key: "PLATFORM_CAMPAIGN_MANAGER", category: "platform", name: "Campaign Manager", definition: "Draft execution platform used to manage paid social campaigns." },
  { key: "ACTIVITY_WEBINAR", category: "activity_type", name: "Webinar", definition: "Draft virtual event activity with registered attendance.", measurementRule: "attendance_status in (attended, no_show)" },
  { key: "FORMAT_SINGLE_IMAGE", category: "creative_format", name: "Single image", definition: "Draft creative format consisting of one static image and accompanying copy." },
  { key: "CTA_REQUEST_DEMO", category: "call_to_action", name: "Request a demo", definition: "Draft action inviting a prospect to request a product demonstration.", measurementRule: "destination_intent = demo_request" },
  { key: "MEMBER_STATUS_WEBINAR_STANDARD", category: "campaign_member_status_template", name: "Webinar — standard", definition: "Draft member-status template for invited, registered, attended, and no-show states.", parent: "ACTIVITY_WEBINAR", measurementRule: "responded = status in (registered, attended)" },
  { key: "FISCAL_CALENDAR_CORPORATE", category: "fiscal_calendar", name: "Corporate fiscal calendar", definition: "Draft authoritative corporate fiscal calendar." },
  { key: "FISCAL_YEAR_2027", category: "fiscal_year", name: "FY2027", definition: "Draft fiscal year governed by the corporate calendar.", parent: "FISCAL_CALENDAR_CORPORATE" },
  { key: "FISCAL_QUARTER_2027_Q1", category: "fiscal_quarter", name: "FY2027 Q1", definition: "Draft first quarter of fiscal year 2027.", parent: "FISCAL_YEAR_2027" },
  { key: "FISCAL_PERIOD_2027_P01", category: "fiscal_period", name: "FY2027 P01", definition: "Draft first fiscal period of fiscal year 2027.", parent: "FISCAL_QUARTER_2027_Q1" },
  { key: "CURRENCY_USD", category: "currency", name: "US dollar", definition: "Draft currency value for United States dollars.", legacy: ["USD"] },
  { key: "COST_CENTER_GLOBAL_MARKETING", category: "cost_center", name: "Global marketing", definition: "Draft cost center for central global marketing investment." },
];

// These are verbatim representative-title/count records from the immutable
// Target_Segments_Personas_Cohorts workbook. Catch-all rows deliberately have
// no canonical persona: source evidence is retained without creating a persona.
const evidenceSeeds = [
  { segmentLabel: "Asset Owners", subsegmentLabel: "Private Institutions", sizeTierLabel: "Large", canonicalPersona: "Finance & Executive Leadership", classificationStatus: "mapped", rawClassification: "Finance & Executive Leadership", representativeTitles: "Chief Financial Officer (3); Chief Executive Officer (2); Senior Vice President, Operations (1); Deputy Deputy Chief Financial Officer, Office Head (1)", planningEstimate: 20, sourceSheet: "AO Final", sourceRows: "R3:R5" },
  { segmentLabel: "Asset Owners", subsegmentLabel: "Private Institutions", sizeTierLabel: "Large", canonicalPersona: null, classificationStatus: "unresolved", rawClassification: "Other / Mixed-title", representativeTitles: "Investments Chief (1); Chief Operations Officer (1); Financial Planning & Analysis Officer (1)", planningEstimate: 3, sourceSheet: "AO Final", sourceRows: "R3:R6" },
  { segmentLabel: "Hedge Funds", subsegmentLabel: "Hedge Funds", sizeTierLabel: "Large", canonicalPersona: "Business Leadership", classificationStatus: "mapped", rawClassification: "Business Leadership", representativeTitles: "Partner (4); Managing Director (2); Chief Operations Officer & Chief Financial Officer (1); Chief Operating Officer (1)", planningEstimate: 11, sourceSheet: "HF Final", sourceRows: "R3:R5" },
  { segmentLabel: "Hedge Funds", subsegmentLabel: "Hedge Funds", sizeTierLabel: "Large", canonicalPersona: null, classificationStatus: "unresolved", rawClassification: "Other / Mixed-title", representativeTitles: "Private Equity Valuations Head (1); Performance Head of Portfolio (1)", planningEstimate: 2, sourceSheet: "HF Final", sourceRows: "R3:R8" },
] as const;

const cohortSeeds = [
  {
    stableKey: "COHORT_EFFICIENCY_LEADERS", name: "Efficiency leaders", version: "1.0",
    inclusionRules: "Accounts with a governed operating-efficiency need signal",
    exclusionRules: "Exclude accounts lacking a current governed efficiency signal",
    valueProposition: "Reduce operational friction through governed automation capabilities",
    source: "Marketing Operations Governance Council baseline treatment", owner: "Audience Governance",
    eligibleChannels: ["CHANNEL_EMAIL", "CHANNEL_EVENT", "CHANNEL_SALES_OUTREACH", "CHANNEL_PAID_SOCIAL"],
  },
  {
    stableKey: "COHORT_AO_FINANCE_EXECUTIVE_LEADERSHIP", name: "Asset Owner Finance & Executive Leadership", version: "1.0",
    inclusionRules: "Asset Owners / Private Institutions / Large; mapped Finance & Executive Leadership workbook classification",
    exclusionRules: "Exclude Other / Mixed-title unresolved classifications",
    valueProposition: "Decision-ready institutional investment oversight messaging",
    source: "Target_Segments_Personas_Cohorts workbook; AO Final", owner: "Audience Governance",
    eligibleChannels: ["CHANNEL_EMAIL", "CHANNEL_EVENT", "CHANNEL_SALES_OUTREACH"],
  },
  {
    stableKey: "COHORT_HF_BUSINESS_LEADERSHIP", name: "Hedge Fund Business Leadership", version: "1.0",
    inclusionRules: "Hedge Funds / Large; mapped Business Leadership workbook classification",
    exclusionRules: "Exclude Other / Mixed-title unresolved classifications",
    valueProposition: "Operational and investment-firm leadership messaging",
    source: "Target_Segments_Personas_Cohorts workbook; HF Final", owner: "Audience Governance",
    eligibleChannels: ["CHANNEL_EMAIL", "CHANNEL_PAID_SOCIAL", "CHANNEL_EVENT"],
  },
] as const;

async function seed() {
  await db.transaction(async (tx) => {
    for (const [key, displayName, supportsParent, supportsMeasurementRule] of categoryNames) {
      await tx.insert(taxonomyCategoriesTable).values({
        key,
        displayName,
        supportsParent,
        supportsMeasurementRule,
        sortOrder: categoryNames.findIndex(([candidate]) => candidate === key),
      }).onConflictDoUpdate({
        target: taxonomyCategoriesTable.key,
        set: { displayName, supportsParent, supportsMeasurementRule },
      });
    }

    for (const seed of valueSeeds) {
      await tx.insert(governedValuesTable).values({
        stableKey: seed.key,
        category: seed.category,
        displayName: seed.name,
        definition: seed.definition,
        status: "active",
        effectiveStart: "2026-08-28",
        taxonomyVersion: "draft-reference-import-1",
        source: "Reference material (unreviewed)",
        owner: "Marketing Operations Governance Council",
        legacyCodes: seed.legacy ?? [],
        measurementRule: seed.measurementRule,
        createdBy: "system-seed",
        updatedBy: "system-seed",
      }).onConflictDoUpdate({
        target: governedValuesTable.stableKey,
        set: {
          category: seed.category,
          displayName: seed.name,
          definition: seed.definition,
          status: "active",
          effectiveStart: "2026-08-28",
          taxonomyVersion: "draft-reference-import-1",
          source: "Reference material (unreviewed)",
          owner: "Marketing Operations Governance Council",
          legacyCodes: seed.legacy ?? [],
          measurementRule: seed.measurementRule ?? null,
          updatedBy: "system-seed",
          updatedAt: new Date(),
        },
      });
    }

    const rows = await tx.select().from(governedValuesTable);
    const byKey = new Map(rows.map((row) => [row.stableKey, row]));
    const segmentRules = [
      ["SEGMENT_ASSET_OWNERS", "ACCOUNT_SIZE_LARGE", "Assets under management", "10000000000", null, "USD"],
      ["SEGMENT_HEDGE_FUNDS", "ACCOUNT_SIZE_LARGE", "Assets under management", "5000000000", null, "USD"],
    ] as const;
    for (const [segmentKey, tierKey, measurementBasis, minimum, maximum, unit] of segmentRules) {
      const segment = byKey.get(segmentKey);
      const tier = byKey.get(tierKey);
      if (segment && tier) await tx.insert(accountSizeRulesTable).values({
        segmentId: segment.id, tierId: tier.id, measurementBasis, minimum, maximum, unit,
        source: "Governance starting rule; requires steward approval", effectiveStart: "2026-08-28", version: "draft-1",
      }).onConflictDoNothing();
    }

    for (const evidence of evidenceSeeds) {
      const existingEvidence = await tx.select({ id: audienceEvidenceTable.id }).from(audienceEvidenceTable).where(and(
        eq(audienceEvidenceTable.sourceFile, "reference-materials/Target_Segments_Personas_Cohorts_1787933333641.xlsx"),
        eq(audienceEvidenceTable.sourceSheet, evidence.sourceSheet),
        eq(audienceEvidenceTable.sourceRows, evidence.sourceRows),
      )).limit(1);
      if (!existingEvidence.length) await tx.insert(audienceEvidenceTable).values({
        ...evidence,
        sourceFile: "reference-materials/Target_Segments_Personas_Cohorts_1787933333641.xlsx",
      });
    }
    for (const cohort of cohortSeeds) {
      const governedCohort = byKey.get(cohort.stableKey);
      if (!governedCohort) continue;
      const eligibleChannelValueIds = cohort.eligibleChannels.flatMap((key) => {
        const channel = byKey.get(key);
        return channel ? [channel.id] : [];
      });
      await tx.insert(messagingCohortVersionsTable).values({
        governedValueId: governedCohort.id,
        version: cohort.version,
        inclusionRules: cohort.inclusionRules,
        exclusionRules: cohort.exclusionRules,
        valueProposition: cohort.valueProposition,
        source: cohort.source,
        owner: cohort.owner,
        eligibleChannelValueIds,
        effectiveStart: "2026-08-28",
      }).onConflictDoUpdate({
        target: [messagingCohortVersionsTable.governedValueId, messagingCohortVersionsTable.version],
        set: { eligibleChannelValueIds },
      });
    }
    for (const seed of valueSeeds) {
      if (!seed.parent) continue;
      const row = byKey.get(seed.key);
      const parent = byKey.get(seed.parent);
      if (row && parent) {
        await tx.update(governedValuesTable).set({ parentId: parent.id })
          .where(eq(governedValuesTable.id, row.id));
      }
    }

    const existingAudits = await tx.select().from(taxonomyAuditEventsTable);
    const audited = new Set(existingAudits.map((event) => event.valueId));
    for (const row of rows) {
      if (audited.has(row.id)) continue;
      await tx.insert(taxonomyAuditEventsTable).values({
        valueId: row.id,
        action: "import_preview_seeded",
        actorId: "system-seed",
        actorLabel: "System seed",
        reason: "Loaded as an unreviewed draft from preserved reference material",
        snapshot: { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() },
      });
    }

    const persona = byKey.get("PERSONA_CFO");
    const seniority = byKey.get("SENIORITY_C_LEVEL");
    if (persona && seniority) {
      await tx.insert(taxonomyAssociationsTable).values({
        fromValueId: persona.id,
        toValueId: seniority.id,
        relationshipType: "has_seniority",
        createdBy: "system-seed",
      }).onConflictDoNothing();
    }
  });
}

seed()
  .then(() => {
    console.log(`Seeded ${categoryNames.length} categories and ${valueSeeds.length} active governed values.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });