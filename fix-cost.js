const fs = require('fs');
let lines = fs.readFileSync('artifacts/campaign-governance/src/pages/campaign-detail.tsx', 'utf-8').split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Cost: ${formatMinorUnitsToCurrency(period.plannedMinor)}') && i > 900) {
    lines[i] = lines[i].replace('period.plannedMinor', 'activity.authoritativeCostMinor');
  }
}
fs.writeFileSync('artifacts/campaign-governance/src/pages/campaign-detail.tsx', lines.join('\n'));
