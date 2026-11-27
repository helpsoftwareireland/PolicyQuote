import { errorMessage, KnowledgeBaseError } from '../errors';
import { loadKnowledgeBaseFromFile, resolveKbPath } from '../kb/kb.loader';

/** `npm run kb:validate [path]` — for risk analysts and CI. Exit code 1 on any issue. */
const filePath = process.argv[2] ?? resolveKbPath();

try {
  const kb = loadKnowledgeBaseFromFile(filePath);
  const entries = Object.entries(kb.riskBands);
  const highestMin = Math.max(...entries.map(([, b]) => b.min));
  const bands = entries
    .map(([id, b]) => {
      // The highest band is open-ended whatever its max says; make that visible to the analyst.
      const upper = b.min === highestMin ? (b.max === null ? '∞' : `${b.max} (open-ended)`) : String(b.max);
      return `${id} ${b.min}-${upper} ×${b.riskMultiplier}`;
    })
    .join(', ');
  console.log(`KB valid: ${filePath}`);
  console.log(`  version ${kb.version} (schema ${kb.schemaVersion}), ${kb.factors.length} factors`);
  console.log(`  bands: ${bands}`);
  console.log(`  factors: ${kb.factors.map((f) => `${f.id}(+${f.points}${f.perOccurrence ? '/occurrence' : ''})`).join(', ')}`);
} catch (err) {
  console.error(`KB INVALID: ${filePath}`);
  console.error(`  ${errorMessage(err)}`);
  if (err instanceof KnowledgeBaseError) {
    err.issues.forEach((issue) => console.error(`  - ${issue.path || '(root)'}: ${issue.message}`));
  }
  process.exitCode = 1;
}
