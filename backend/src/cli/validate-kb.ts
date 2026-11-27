import { KnowledgeBaseError } from '../errors';
import { loadKnowledgeBaseFromFile, resolveKbPath } from '../kb/kb.loader';

/** `npm run kb:validate [path]` — for risk analysts and CI. Exit code 1 on any issue. */
const filePath = process.argv[2] ?? resolveKbPath();

try {
  const kb = loadKnowledgeBaseFromFile(filePath);
  const bands = Object.entries(kb.riskBands)
    .map(([id, b]) => `${id} ${b.min}-${b.max ?? '∞'} ×${b.riskMultiplier}`)
    .join(', ');
  console.log(`KB valid: ${filePath}`);
  console.log(`  version ${kb.version} (schema ${kb.schemaVersion}), ${kb.factors.length} factors`);
  console.log(`  bands: ${bands}`);
  console.log(`  factors: ${kb.factors.map((f) => `${f.id}(+${f.points}${f.perOccurrence ? '/occurrence' : ''})`).join(', ')}`);
} catch (err) {
  console.error(`KB INVALID: ${filePath}`);
  console.error(`  ${(err as Error).message}`);
  if (err instanceof KnowledgeBaseError) {
    err.issues.forEach((issue) => console.error(`  - ${issue.path || '(root)'}: ${issue.message}`));
  }
  process.exitCode = 1;
}
