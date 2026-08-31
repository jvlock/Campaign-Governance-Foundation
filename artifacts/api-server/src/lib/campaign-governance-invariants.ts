import { and, eq, inArray } from "drizzle-orm";
import {
  accountSizeRulesTable,
  campaignAudienceSelectionsTable,
  campaignCohortTreatmentsTable,
  db,
  messagingCohortVersionsTable,
} from "@workspace/db";
import { governanceAssignmentIssues } from "./campaign-governance-validity";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function validatePersistedGovernanceAssignments(
  tx: Transaction,
  campaign: {
    campaignKey: string;
    startDate: string | null;
    endDate: string | null;
    setupData: unknown;
  },
): Promise<string[]> {
  const audiences = await tx.select().from(campaignAudienceSelectionsTable)
    .where(eq(campaignAudienceSelectionsTable.campaignKey, campaign.campaignKey));
  const cohorts = await tx.select().from(campaignCohortTreatmentsTable)
    .where(eq(campaignCohortTreatmentsTable.campaignKey, campaign.campaignKey));
  const ruleIds = audiences.flatMap((selection) => selection.accountSizeRuleId ? [selection.accountSizeRuleId] : []);
  const treatmentIds = cohorts.map((association) => association.treatmentId);
  const rules = ruleIds.length
    ? await tx.select().from(accountSizeRulesTable).where(inArray(accountSizeRulesTable.id, ruleIds))
    : [];
  const treatments = treatmentIds.length
    ? await tx.select().from(messagingCohortVersionsTable).where(and(inArray(messagingCohortVersionsTable.id, treatmentIds)))
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const start = campaign.startDate ?? today;
  const end = campaign.endDate ?? start;
  const setupData = campaign.setupData as { channelValueIds?: unknown };
  const channels = Array.isArray(setupData?.channelValueIds)
    ? setupData.channelValueIds.filter((value): value is string => typeof value === "string")
    : [];
  return governanceAssignmentIssues({
    campaignStart: start,
    campaignEnd: end,
    channelValueIds: channels,
    primarySegmentId: audiences.find((selection) => selection.dimension === "segment_family" && selection.isPrimary)?.governedValueId ?? null,
    accountSelections: audiences.filter((selection) => selection.dimension === "account_size_tier").map((selection) => ({
      tierId: selection.governedValueId,
      measurementBasis: selection.measurementBasis,
      ruleId: selection.accountSizeRuleId,
      ruleVersion: selection.accountSizeRuleVersion,
    })),
    accountRules: rules,
    cohortSelectionIds: audiences.filter((selection) => selection.dimension === "messaging_cohort")
      .flatMap((selection) => selection.governedValueId ? [selection.governedValueId] : []),
    cohortAssociations: cohorts,
    cohortVersions: treatments,
  });
}