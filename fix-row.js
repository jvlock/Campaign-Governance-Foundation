const fs = require('fs');
let content = fs.readFileSync('artifacts/campaign-governance/src/pages/campaign-detail.tsx', 'utf-8');

content = content.replace(
  'const remainingMinor = subtractMinorUnits(period.approvedMinor, period.actualMinor);\n  const varianceVal = plannedVal - actualVal;',
  'const remainingMinor = subtractMinorUnits(period.approvedMinor, period.actualMinor);\n  const varianceMinor = subtractMinorUnits(period.plannedMinor, period.actualMinor);\n  const isVarianceNegative = varianceMinor.startsWith(\'-\');'
);

content = content.replace(
  /\$\{formatMinorUnitsToCurrency\(activity\.authoritativeCostMinor\)\}/g,
  '${formatMinorUnitsToCurrency(period.plannedMinor)}'
);

content = content.replace(
  /\$\{formatMinorUnitsToCurrency\(totalActualMinor\)\}/g,
  '${formatMinorUnitsToCurrency(period.actualMinor)}'
);

fs.writeFileSync('artifacts/campaign-governance/src/pages/campaign-detail.tsx', content);
