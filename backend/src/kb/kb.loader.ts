import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { errorMessage, KnowledgeBaseError, type FieldIssue } from '../errors';
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

/** Why the KB on disk is not the one being served (review item G4). */
export interface KbReloadError {
  readonly at: string;
  readonly filePath: string;
  readonly message: string;
  readonly issues: readonly FieldIssue[];
}

export interface KnowledgeBaseStatus {
  /** `stale` = the file on disk was rejected; the last-known-good KB is still serving. */
  readonly kbStatus: 'current' | 'stale';
  readonly lastReloadError?: KbReloadError;
}

let cache: CacheEntry | undefined;
let lastReloadError: KbReloadError | undefined;

function rejectReload(previous: CacheEntry, filePath: string, err: unknown): KnowledgeBase {
  const issues = err instanceof KnowledgeBaseError ? err.issues : [];
  lastReloadError = { at: new Date().toISOString(), filePath, message: errorMessage(err), issues };
  logger.error('KB reload rejected; serving last-known-good', {
    kbVersion: previous.kb.version,
    error: lastReloadError.message,
    issues,
  });
  return previous.kb;
}

/**
 * Cached KB for the warm Lambda container / server process (Architecture §5.6).
 * - Re-validates when the file's mtime changes → KB edits apply without a restart.
 * - If the new file is invalid or missing, keeps serving the last-known-good KB, logs the issues and
 *   records them so `/health` and the `X-KB-Status` header surface the problem (never silent).
 */
export function getKnowledgeBase(filePath: string = resolveKbPath()): KnowledgeBase {
  const previous = cache?.filePath === filePath ? cache : undefined;

  let mtimeMs: number;
  try {
    mtimeMs = statSync(filePath).mtimeMs;
  } catch (err) {
    if (previous) return rejectReload(previous, filePath, err);
    throw new KnowledgeBaseError(`Cannot read Knowledge Base at ${filePath}: ${errorMessage(err)}`);
  }

  if (previous && previous.mtimeMs === mtimeMs) return previous.kb;

  try {
    const kb = loadKnowledgeBaseFromFile(filePath);
    cache = { filePath, mtimeMs, kb };
    lastReloadError = undefined;
    logger.info(previous ? 'KB reloaded' : 'KB loaded', {
      kbVersion: kb.version,
      previousVersion: previous?.kb.version,
      factorCount: kb.factors.length,
    });
    return kb;
  } catch (err) {
    if (!previous) throw err;
    // Remember this mtime so a broken file isn't re-parsed on every request.
    cache = { ...previous, mtimeMs };
    return rejectReload(previous, filePath, err);
  }
}

export function getKnowledgeBaseStatus(): KnowledgeBaseStatus {
  return lastReloadError ? { kbStatus: 'stale', lastReloadError } : { kbStatus: 'current' };
}

/** Test hook. */
export function resetKnowledgeBaseCache(): void {
  cache = undefined;
  lastReloadError = undefined;
}

