import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { errorMessage, KnowledgeBaseError } from '../errors';
import { logger } from '../logger';
import { flattenKbIssues, KnowledgeBaseSchema } from './kb.schema';
import type { KnowledgeBase } from './kb.types';

/** `<repo>/kb/risk-kb.json` — same depth from `src/kb` and `dist/kb`. Override with KB_PATH. */
export const DEFAULT_KB_PATH = path.resolve(__dirname, '..', '..', '..', 'kb', 'risk-kb.json');

export const resolveKbPath = (): string => (process.env.KB_PATH ? path.resolve(process.env.KB_PATH) : DEFAULT_KB_PATH);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

/** Validate an already-parsed JSON value. Throws KnowledgeBaseError with precise paths. */
export function parseKnowledgeBase(raw: unknown): KnowledgeBase {
  const result = KnowledgeBaseSchema.safeParse(raw);
  if (!result.success) {
    throw new KnowledgeBaseError('Knowledge Base failed validation', flattenKbIssues(result.error.issues));
  }
  return deepFreeze(result.data);
}

export function loadKnowledgeBaseFromFile(filePath: string): KnowledgeBase {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new KnowledgeBaseError(`Cannot read Knowledge Base at ${filePath}: ${errorMessage(err)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new KnowledgeBaseError(`Knowledge Base is not valid JSON: ${errorMessage(err)}`);
  }
  return parseKnowledgeBase(json);
}

interface CacheEntry {
  readonly filePath: string;
  readonly mtimeMs: number;
  readonly kb: KnowledgeBase;
}

let cache: CacheEntry | undefined;

/**
 * Cached KB for the warm Lambda container / server process (Architecture §5.6).
 * - Re-validates when the file's mtime changes → KB edits apply without a restart.
 * - If the new file is invalid, keeps serving the last-known-good KB and logs the issues,
 *   so a typo in the KB never takes pricing down.
 */
export function getKnowledgeBase(filePath: string = resolveKbPath()): KnowledgeBase {
  const previous = cache?.filePath === filePath ? cache : undefined;

  let mtimeMs: number;
  try {
    mtimeMs = statSync(filePath).mtimeMs;
  } catch (err) {
    if (previous) {
      logger.error('KB file unavailable; serving last-known-good', { kbVersion: previous.kb.version, error: errorMessage(err) });
      return previous.kb;
    }
    throw new KnowledgeBaseError(`Cannot read Knowledge Base at ${filePath}: ${errorMessage(err)}`);
  }

  if (previous && previous.mtimeMs === mtimeMs) return previous.kb;

  try {
    const kb = loadKnowledgeBaseFromFile(filePath);
    cache = { filePath, mtimeMs, kb };
    logger.info(previous ? 'KB reloaded' : 'KB loaded', {
      kbVersion: kb.version,
      previousVersion: previous?.kb.version,
      factorCount: kb.factors.length,
    });
    return kb;
  } catch (err) {
    if (!previous) throw err;
    const issues = err instanceof KnowledgeBaseError ? err.issues : [];
    logger.error('KB reload rejected; serving last-known-good', {
      kbVersion: previous.kb.version,
      error: errorMessage(err),
      issues,
    });
    // Remember this mtime so a broken file isn't re-parsed on every request.
    cache = { ...previous, mtimeMs };
    return previous.kb;
  }
}

/** Test hook. */
export function resetKnowledgeBaseCache(): void {
  cache = undefined;
}
