export type CohortTreatmentCandidate = {
  id: string;
  stableKey: string;
  version: string;
  status: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  eligibleChannels: string[];
};

export function chooseCohortTreatment(
  candidates: CohortTreatmentCandidate[],
  campaignDate: string,
  channelStableKeys: string[],
  requestedId?: string | null,
) {
  const eligible = candidates.filter((candidate) =>
    candidate.status === "active"
    && candidate.effectiveStart <= campaignDate
    && (!candidate.effectiveEnd || candidate.effectiveEnd >= campaignDate)
    && channelStableKeys.every((channel) => candidate.eligibleChannels.includes(channel))
    && (!requestedId || candidate.id === requestedId),
  );
  return eligible.sort((a, b) =>
    b.effectiveStart.localeCompare(a.effectiveStart)
    || b.version.localeCompare(a.version, undefined, { numeric: true }),
  )[0] ?? null;
}