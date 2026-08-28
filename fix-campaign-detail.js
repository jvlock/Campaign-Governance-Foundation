const fs = require('fs');
let content = fs.readFileSync('artifacts/campaign-governance/src/pages/campaign-detail.tsx', 'utf-8');

// Add imports
content = content.replace(
  'import { cn } from "@/lib/utils";',
  'import { cn, formatMinorUnitsToCurrency, parseDecimalToMinorUnits, sumMinorUnits, subtractMinorUnits } from "@/lib/utils";'
);
if (!content.includes('formatMinorUnitsToCurrency')) {
  // Try finding a good place to insert if cn is not there
  content = content.replace(
    'import { useToast } from "@/hooks/use-toast";',
    'import { useToast } from "@/hooks/use-toast";\nimport { cn, formatMinorUnitsToCurrency, parseDecimalToMinorUnits, sumMinorUnits, subtractMinorUnits } from "@/lib/utils";'
  );
}

// 1. replace in Plan Summary (Line 380ish)
// ${(campaign.planningPeriods || []).reduce((acc, p) => acc + (parseInt(p.requestedMinor, 10)/100), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}
content = content.replace(
  /\$\{\(campaign\.planningPeriods \|\| \[\]\)\.reduce\(\(acc, p\) => acc \+ \(parseInt\(p\.requestedMinor, 10\)\/100\), 0\)\.toLocaleString\(undefined, \{minimumFractionDigits: 2, maximumFractionDigits:2\}\)\}/g,
  "${formatMinorUnitsToCurrency(campaign.planningPeriods?.reduce((acc, p) => sumMinorUnits(acc, p.requestedMinor), '0') || '0')}"
);

// 2. replace in Budget Dialog
content = content.replace(
  /<Label>Total Requested Minor Amount \(e\.g\. 100000 for \$1,000\.00\)<\/Label>/g,
  "<Label>Total Requested Amount (e.g. 1000.00)</Label>"
);
content = content.replace(
  /<Label>Authoritative Cost \(Minor\)<\/Label>/g,
  "<Label>Authoritative Cost</Label>"
);
content = content.replace(
  /<Label>Amount \(Minor\)<\/Label>/g,
  "<Label>Amount</Label>"
);
content = content.replace(
  /<Label>Planned Amount \(Minor\)<\/Label>/g,
  "<Label>Planned Amount</Label>"
);
content = content.replace(
  /<Label>Committed Amount \(Minor\)<\/Label>/g,
  "<Label>Committed Amount</Label>"
);
content = content.replace(
  /<Label>Actual Amount \(Minor\)<\/Label>/g,
  "<Label>Actual Amount</Label>"
);
content = content.replace(
  /<Label>Forecast Amount \(Minor\)<\/Label>/g,
  "<Label>Forecast Amount</Label>"
);

// replace input types
content = content.replace(
  /type="number"/g,
  'type="text"'
);

// API call parsing
content = content.replace(
  /requestedMinor: reqAmount,\s+approvedMinor: reqAmount/g,
  "requestedMinor: parseDecimalToMinorUnits(reqAmount),\n          approvedMinor: parseDecimalToMinorUnits(reqAmount)"
);
content = content.replace(
  /authoritativeCostMinor: actCost/g,
  "authoritativeCostMinor: parseDecimalToMinorUnits(actCost)"
);
content = content.replace(
  /authoritativeAmountMinor: costAmount/g,
  "authoritativeAmountMinor: parseDecimalToMinorUnits(costAmount)"
);
content = content.replace(
  /plannedMinor: plannedMinor/g,
  "plannedMinor: parseDecimalToMinorUnits(plannedMinor)"
);
content = content.replace(
  /committedMinor: committedMinor/g,
  "committedMinor: parseDecimalToMinorUnits(committedMinor)"
);
content = content.replace(
  /actualMinor: actualMinor/g,
  "actualMinor: parseDecimalToMinorUnits(actualMinor)"
);
content = content.replace(
  /forecastMinor: forecastMinor/g,
  "forecastMinor: parseDecimalToMinorUnits(forecastMinor)"
);
content = content.replace(
  /authoritativeCostMinor: cost/g,
  "authoritativeCostMinor: parseDecimalToMinorUnits(cost)"
);
content = content.replace(
  /authoritativeAmountMinor: amount/g,
  "authoritativeAmountMinor: parseDecimalToMinorUnits(amount)"
);


// 3. Planning Period Row
// const approvedVal = parseInt(period.approvedMinor, 10) / 100;
content = content.replace(
  /const approvedVal = parseInt\(period\.approvedMinor, 10\) \/ 100;\s*const plannedVal = parseInt\(period\.plannedMinor, 10\) \/ 100;\s*const actualVal = parseInt\(period\.actualMinor, 10\) \/ 100;\s*const remainingVal = approvedVal - actualVal;/g,
  "const remainingMinor = subtractMinorUnits(period.approvedMinor, period.actualMinor);"
);

// We need to replace references to plannedVal, approvedVal, actualVal, remainingVal in the row rendering.
content = content.replace(
  /\$\{approvedVal\.toLocaleString\(undefined, \{minimumFractionDigits: 2\}\)\}/g,
  "${formatMinorUnitsToCurrency(period.approvedMinor)}"
);
content = content.replace(
  /\$\{plannedVal\.toLocaleString\(undefined, \{minimumFractionDigits: 2\}\)\}/g,
  "${formatMinorUnitsToCurrency(period.plannedMinor)}"
);
content = content.replace(
  /\$\{\(parseInt\(period\.committedMinor, 10\)\/100\)\.toLocaleString\(undefined, \{minimumFractionDigits: 2\}\)\}/g,
  "${formatMinorUnitsToCurrency(period.committedMinor)}"
);
content = content.replace(
  /\$\{actualVal\.toLocaleString\(undefined, \{minimumFractionDigits: 2\}\)\}/g,
  "${formatMinorUnitsToCurrency(period.actualMinor)}"
);
content = content.replace(
  /\$\{remainingVal\.toLocaleString\(undefined, \{minimumFractionDigits: 2\}\)\}/g,
  "${formatMinorUnitsToCurrency(remainingMinor)}"
);

// 4. Badges (Planned, Actual)
content = content.replace(
  /\$\{\(parseInt\(String\(snap\.plannedMinor\), 10\)\/100\)\.toLocaleString\(\)\}/g,
  "${formatMinorUnitsToCurrency(String(snap.plannedMinor))}"
);
content = content.replace(
  /\$\{\(parseInt\(String\(snap\.actualMinor\), 10\)\/100\)\.toLocaleString\(\)\}/g,
  "${formatMinorUnitsToCurrency(String(snap.actualMinor))}"
);

// 5. Activity Cost
content = content.replace(
  /\$\{\(parseInt\(activity\.authoritativeCostMinor, 10\)\/100\)\.toLocaleString\(undefined, \{minimumFractionDigits: 2\}\)\}/g,
  "${formatMinorUnitsToCurrency(activity.authoritativeCostMinor)}"
);

// 6. Cost Amount
content = content.replace(
  /\$\{\(parseInt\(cost\.authoritativeAmountMinor, 10\)\/100\)\.toLocaleString\(undefined, \{minimumFractionDigits: 2\}\)\}/g,
  "${formatMinorUnitsToCurrency(cost.authoritativeAmountMinor)}"
);

// 7. Activity variance (plannedVal, actualVal, varianceVal) in ActivityRow
//   const plannedVal = parseInt(activity.authoritativeCostMinor, 10) / 100;
//   const actualVal = costs.reduce((acc, c) => acc + (parseInt(c.authoritativeAmountMinor, 10) / 100), 0);
//   const varianceVal = plannedVal - actualVal;
content = content.replace(
  /const plannedVal = parseInt\(activity\.authoritativeCostMinor, 10\) \/ 100;\s*const actualVal = costs\.reduce\(\(acc, c\) => acc \+ \(parseInt\(c\.authoritativeAmountMinor, 10\) \/ 100\), 0\);\s*const varianceVal = plannedVal - actualVal;/g,
  `const totalActualMinor = costs.reduce((acc, c) => sumMinorUnits(acc, c.authoritativeAmountMinor), "0");
  const varianceMinor = subtractMinorUnits(activity.authoritativeCostMinor, totalActualMinor);
  const isVarianceNegative = varianceMinor.startsWith('-');`
);
content = content.replace(
  /\$\{plannedVal\.toLocaleString\(\)\}/g,
  "${formatMinorUnitsToCurrency(activity.authoritativeCostMinor)}"
);
content = content.replace(
  /\$\{actualVal\.toLocaleString\(\)\}/g,
  "${formatMinorUnitsToCurrency(totalActualMinor)}"
);
content = content.replace(
  /varianceVal < 0/g,
  "isVarianceNegative"
);
content = content.replace(
  /\$\{varianceVal\.toLocaleString\(\)\}/g,
  "${formatMinorUnitsToCurrency(varianceMinor)}"
);


fs.writeFileSync('artifacts/campaign-governance/src/pages/campaign-detail.tsx', content);
