export type GovernanceAssignmentState = {
  campaignStart: string;
  campaignEnd: string;
  channelValueIds: string[];
  primarySegmentId: string | null;
  accountSelections: Array<{
    tierId: string | null;
    measurementBasis: string | null;
    ruleId: string | null;
    ruleVersion: string | null;
  }>;
  accountRules: Array<{
    id: string;
    segmentId: string;
    tierId: string;
    measurementBasis: string;
    version: string;
    effectiveStart: string;
    effectiveEnd: string | null;
  }>;
  cohortSelectionIds: string[];
  cohortAssociations: Array<{ governedValueId: string; treatmentId: string; treatmentVersion: string }>;
  cohortVersions: Array<{
    id: string;
    governedValueId: string;
    version: string;
    effectiveStart: string;
    effectiveEnd: string | null;
    eligibleChannelValueIds: string[];
  }>;
};

export function governanceAssignmentIssues(state: GovernanceAssignmentState): string[] {
  const issues: string[] = [];
  for (const selection of state.accountSelections) {
    const rule = state.accountRules.find((candidate) => candidate.id === selection.ruleId);
    if (!rule
      || rule.segmentId !== state.primarySegmentId
      || rule.tierId !== selection.tierId
      || rule.measurementBasis !== selection.measurementBasis
      || rule.version !== selection.ruleVersion
      || rule.effectiveStart > state.campaignStart
      || Boolean(rule.effectiveEnd && rule.effectiveEnd < state.campaignEnd)) {
      issues.push("Persisted account-size rule is no longer eligible");
    }
  }
  if (state.cohortSelectionIds.some((id) => !state.cohortAssociations.some((association) => association.governedValueId === id))) {
    issues.push("Persisted messaging-cohort treatment is no longer eligible");
  }
  for (const association of state.cohortAssociations) {
    const treatment = state.cohortVersions.find((candidate) => candidate.id === association.treatmentId);
    if (!treatment
      || !state.cohortSelectionIds.includes(association.governedValueId)
      || treatment.governedValueId !== association.governedValueId
      || treatment.version !== association.treatmentVersion
      || treatment.effectiveStart > state.campaignStart
      || Boolean(treatment.effectiveEnd && treatment.effectiveEnd < state.campaignEnd)
      || state.channelValueIds.some((channel) => !treatment.eligibleChannelValueIds.includes(channel))) {
      issues.push("Persisted messaging-cohort treatment is no longer eligible");
    }
  }
  return [...new Set(issues)];
}

export function nextCampaignPlanVersion(status: string, lockedRowVersion: number, providedRowVersion: number): number | null {
  return status === "draft" && lockedRowVersion === providedRowVersion ? lockedRowVersion + 1 : null;
}