export type DatedPeriod = {
  id: string;
  stableKey: string;
  fiscalYear: string;
  fiscalQuarter: string;
  fiscalPeriod: string;
  startDate: string;
  endDate: string;
};

export type MinorAllocation = { key: string; amountMinor: string };

const DAY_MS = 86_400_000;

export function parseMinor(value: string, field = "amount"): bigint {
  if (!/^-?\d+$/.test(value)) throw new Error(`${field} must be an integer minor-unit string`);
  return BigInt(value);
}

function utcDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid calendar date: ${value}`);
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return time;
}

export function daysInclusive(start: string, end: string): bigint {
  const days = (utcDay(end) - utcDay(start)) / DAY_MS + 1;
  if (days < 1) throw new Error("End date cannot precede start date");
  return BigInt(days);
}

export function touchedPeriods(start: string, end: string, periods: DatedPeriod[]): DatedPeriod[] {
  utcDay(start);
  utcDay(end);
  if (end < start) throw new Error("End date cannot precede start date");
  const sorted = periods.filter((period) => period.startDate <= end && period.endDate >= start)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1]!.endDate >= sorted[index]!.startDate) {
      throw new Error("Fiscal periods overlap");
    }
  }
  return sorted;
}

export function allocateByWeights(totalValue: string, weights: Array<{ key: string; weight: bigint }>): MinorAllocation[] {
  const total = parseMinor(totalValue);
  if (total < 0n) throw new Error("Allocation total cannot be negative");
  if (!weights.length || weights.some(({ weight }) => weight < 0n)) throw new Error("Allocation weights are invalid");
  const denominator = weights.reduce((sum, item) => sum + item.weight, 0n);
  if (denominator === 0n) throw new Error("Allocation weights must total more than zero");
  const rows = weights.map((item, order) => {
    const numerator = total * item.weight;
    return { ...item, order, amount: numerator / denominator, remainder: numerator % denominator };
  });
  let remainder = total - rows.reduce((sum, row) => sum + row.amount, 0n);
  rows.sort((a, b) => a.remainder === b.remainder ? a.order - b.order : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; remainder > 0n; index += 1, remainder -= 1n) rows[index % rows.length]!.amount += 1n;
  rows.sort((a, b) => a.order - b.order);
  return rows.map((row) => ({ key: row.key, amountMinor: row.amount.toString() }));
}

export function allocateEvenly(total: string, keys: string[]): MinorAllocation[] {
  return allocateByWeights(total, keys.map((key) => ({ key, weight: 1n })));
}

export function reconcileMinor(totalValue: string, allocations: MinorAllocation[]): void {
  const total = parseMinor(totalValue);
  const allocated = allocations.reduce((sum, row) => sum + parseMinor(row.amountMinor), 0n);
  if (allocated !== total) throw new Error(`Allocations must reconcile exactly: expected ${total}, received ${allocated}`);
}

export function periodAllocation(
  method: "even" | "monthly" | "quarterly" | "custom",
  total: string,
  periods: DatedPeriod[],
  custom?: MinorAllocation[],
): MinorAllocation[] {
  if (method === "custom") {
    if (!custom) throw new Error("Custom allocations are required");
    reconcileMinor(total, custom);
    const valid = new Set(periods.map(({ id }) => id));
    if (custom.some(({ key }) => !valid.has(key))) throw new Error("Custom allocation contains an unrelated period");
    return custom;
  }
  if (method === "quarterly") {
    const quarters = new Map<string, DatedPeriod[]>();
    for (const period of periods) {
      const key = `${period.fiscalYear}:${period.fiscalQuarter}`;
      quarters.set(key, [...(quarters.get(key) ?? []), period]);
    }
    const quarterTotals = allocateEvenly(total, [...quarters.keys()]);
    return quarterTotals.flatMap((quarter) => allocateEvenly(
      quarter.amountMinor,
      quarters.get(quarter.key)!.map(({ id }) => id),
    ));
  }
  if (method === "monthly") {
    return allocateByWeights(total, periods.map((period) => ({
      key: period.id,
      weight: daysInclusive(period.startDate, period.endDate),
    })));
  }
  return allocateEvenly(total, periods.map(({ id }) => id));
}

export function activityAllocation(
  method: "invoice_date" | "daily" | "monthly" | "custom",
  total: string,
  deliveryStart: string,
  deliveryEnd: string,
  periods: DatedPeriod[],
  accountingDate?: string | null,
  custom?: MinorAllocation[],
): MinorAllocation[] {
  const touched = touchedPeriods(deliveryStart, deliveryEnd, periods);
  if (method === "invoice_date") {
    if (!accountingDate) throw new Error("Invoice-date allocation requires an accounting date");
    const period = periods.find((item) => item.startDate <= accountingDate && item.endDate >= accountingDate);
    if (!period) throw new Error("Accounting date does not belong to an available planning period");
    return [{ key: period.id, amountMinor: parseMinor(total).toString() }];
  }
  if (method === "custom") return periodAllocation("custom", total, touched, custom);
  return allocateByWeights(total, touched.map((period) => {
    const overlapStart = period.startDate > deliveryStart ? period.startDate : deliveryStart;
    const overlapEnd = period.endDate < deliveryEnd ? period.endDate : deliveryEnd;
    return {
      key: period.id,
      weight: method === "daily"
        ? daysInclusive(overlapStart, overlapEnd)
        : BigInt(monthKeys(overlapStart, overlapEnd).length),
    };
  }));
}

function monthKeys(start: string, end: string): string[] {
  const result: string[] = [];
  let cursor = `${start.slice(0, 7)}-01`;
  while (cursor <= end) {
    result.push(cursor.slice(0, 7));
    const date = new Date(utcDay(cursor));
    date.setUTCMonth(date.getUTCMonth() + 1);
    cursor = date.toISOString().slice(0, 10);
  }
  return result;
}

export function derivedBudgetValues(row: {
  approvedMinor: string; plannedMinor: string; committedMinor: string;
  actualMinor: string; forecastMinor: string;
}) {
  const approved = parseMinor(row.approvedMinor);
  const actual = parseMinor(row.actualMinor);
  const forecast = parseMinor(row.forecastMinor);
  return {
    remainingMinor: (approved - actual - parseMinor(row.committedMinor)).toString(),
    varianceMinor: (approved - forecast).toString(),
  };
}

export function setupIssues(input: {
  name?: string | null; campaignType?: string | null; objective?: string | null;
  customerNeed?: string | null; desiredAction?: string | null;
  startDate?: string | null; endDate?: string | null; isEvergreen?: boolean;
  audienceCount?: number; productCount?: number;
}): string[] {
  const issues: string[] = [];
  for (const [field, value] of Object.entries({
    "Campaign name": input.name,
    "Campaign type": input.campaignType,
    "Business objective": input.objective,
    "Customer need or opportunity": input.customerNeed,
    "Desired audience action": input.desiredAction,
    "Start date": input.startDate,
  })) if (!value) issues.push(`${field} is required`);
  if (!input.isEvergreen && !input.endDate) issues.push("Expected end date is required unless the campaign is evergreen");
  if (!input.audienceCount) issues.push("At least one audience selection is required");
  if (!input.productCount) issues.push("At least one product or capability is required");
  if (input.startDate && input.endDate && input.endDate < input.startDate) issues.push("Expected end date cannot precede start date");
  return issues;
}