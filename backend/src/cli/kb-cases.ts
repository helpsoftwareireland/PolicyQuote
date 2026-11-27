import { errorMessage } from '../errors';
import { generateFactorCases } from '../kb/kb-case-generator';
import { loadKnowledgeBaseFromFile, resolveKbPath } from '../kb/kb.loader';
import type { QuoteInput } from '../quote/quote.schema';

/**
 * `npm run kb:cases [path]` — print the boundary test cases generated from each KB factor.
 * The same cases run as Jest tests in test/kb-generated-cases.spec.ts.
 */
const NEUTRAL: QuoteInput = {
  customerName: 'Probe Case',
  age: 40,
  propertyType: 'House',
  propertyValue: 300000,
  postcode: 'SW1A 1AA',
  previousClaims: 0,
};

const filePath = process.argv[2] ?? resolveKbPath();
try {
  const kb = loadKnowledgeBaseFromFile(filePath);
  let total = 0;
  const neverApplies: string[] = [];
  console.log(`KB ${kb.version}: generated cases (neutral base: age 40, House £300k, SW1A 1AA, 0 claims)\n`);
  for (const factor of kb.factors) {
    const { cases, unreachable } = generateFactorCases(factor, NEUTRAL);
    total += cases.length;
    console.log(`${factor.id}  (+${factor.points}${factor.perOccurrence ? '/occurrence' : ''})`);
    for (const c of cases) {
      const outcome = c.kind === 'hit' ? `applies, +${c.expectedPoints}` : 'does not apply';
      console.log(`  ${c.kind.toUpperCase().padEnd(4)}  ${c.label.padEnd(44)} → ${outcome}`);
    }
    for (const u of unreachable) console.log(`  SKIP  ${u.label.padEnd(44)} → unreachable (${u.reason})`);
    if (!cases.some((c) => c.kind === 'hit')) neverApplies.push(factor.id);
  }
  console.log(`\n${total} cases from ${kb.factors.length} factors. Run them: npm test -- kb-generated-cases`);
  if (neverApplies.length > 0) {
    console.error(`WARNING: no valid request can trigger: ${neverApplies.join(', ')}`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`Cannot generate cases: ${errorMessage(err)}`);
  process.exitCode = 1;
}
