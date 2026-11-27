import { mkdtempSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KnowledgeBaseError } from '../src/errors';
import {
  DEFAULT_KB_PATH,
  getKnowledgeBase,
  getKnowledgeBaseStatus,
  loadKnowledgeBaseFromFile,
  resetKnowledgeBaseCache,
  resolveKbPath,
} from '../src/kb/kb.loader';
import { BASE_KB_JSON } from './fixtures/kb.fixture';

describe('KB loader (KB-07, KB-09)', () => {
  let dir: string;
  let kbFile: string;
  let tick = Date.now() / 1000;

  /** Write the file and force a distinct mtime (filesystems can have coarse timestamps). */
  const writeKb = (content: string): void => {
    writeFileSync(kbFile, content);
    tick += 10;
    utimesSync(kbFile, tick, tick);
  };
  const kbJson = (version: string) => JSON.stringify({ ...BASE_KB_JSON, version });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kb-'));
    kbFile = path.join(dir, 'risk-kb.json');
    resetKnowledgeBaseCache();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.KB_PATH;
  });

  it('defaults to <repo>/kb/risk-kb.json and honours KB_PATH', () => {
    expect(DEFAULT_KB_PATH).toBe(path.resolve(__dirname, '..', '..', 'kb', 'risk-kb.json'));
    expect(resolveKbPath()).toBe(DEFAULT_KB_PATH);
    process.env.KB_PATH = kbFile;
    expect(resolveKbPath()).toBe(kbFile);
  });

  it('loads and caches until the file changes', () => {
    writeKb(kbJson('1.0.0'));
    const first = getKnowledgeBase(kbFile);
    expect(first.version).toBe('1.0.0');
    expect(getKnowledgeBase(kbFile)).toBe(first); // same instance → cached
  });

  it('hot-reloads when the file is edited (no restart needed)', () => {
    writeKb(kbJson('1.0.0'));
    getKnowledgeBase(kbFile);
    writeKb(kbJson('1.1.0'));
    expect(getKnowledgeBase(kbFile).version).toBe('1.1.0');
  });

  it('keeps serving the last-known-good KB when an edit is invalid', () => {
    writeKb(kbJson('1.0.0'));
    getKnowledgeBase(kbFile);

    writeKb('{ "this is": not json');
    expect(getKnowledgeBase(kbFile).version).toBe('1.0.0');

    writeKb(JSON.stringify({ ...BASE_KB_JSON, version: '2.0.0', basePremium: -5 }));
    expect(getKnowledgeBase(kbFile).version).toBe('1.0.0');

    writeKb(kbJson('1.2.0')); // fixed → picked up
    expect(getKnowledgeBase(kbFile).version).toBe('1.2.0');
  });

  it('reports a rejected reload as "stale" until a valid KB is saved (G4: never silent)', () => {
    writeKb(kbJson('1.0.0'));
    getKnowledgeBase(kbFile);
    expect(getKnowledgeBaseStatus()).toEqual({ kbStatus: 'current' });

    writeKb(JSON.stringify({ ...BASE_KB_JSON, version: '1.1.0', basePremium: -5 }));
    expect(getKnowledgeBase(kbFile).version).toBe('1.0.0');
    const stale = getKnowledgeBaseStatus();
    expect(stale.kbStatus).toBe('stale');
    expect(stale.lastReloadError).toMatchObject({ filePath: kbFile, message: 'Knowledge Base failed validation' });
    expect(stale.lastReloadError?.issues[0]?.path).toBe('basePremium');

    writeKb(kbJson('1.2.0'));
    expect(getKnowledgeBase(kbFile).version).toBe('1.2.0');
    expect(getKnowledgeBaseStatus()).toEqual({ kbStatus: 'current' });
  });

  it('keeps serving the last-known-good KB if the file disappears', () => {
    writeKb(kbJson('1.0.0'));
    getKnowledgeBase(kbFile);
    unlinkSync(kbFile);
    expect(getKnowledgeBase(kbFile).version).toBe('1.0.0');
    expect(getKnowledgeBaseStatus().kbStatus).toBe('stale');
  });

  it('fails fast with KnowledgeBaseError when there is no good KB at all', () => {
    expect(() => getKnowledgeBase(path.join(dir, 'missing.json'))).toThrow(KnowledgeBaseError);
    writeKb('not json');
    expect(() => getKnowledgeBase(kbFile)).toThrow(/not valid JSON/);
    expect(() => loadKnowledgeBaseFromFile(path.join(dir, 'missing.json'))).toThrow(/Cannot read Knowledge Base/);
  });

  it('reports precise validation issues', () => {
    writeKb(JSON.stringify({ ...BASE_KB_JSON, basePremium: 'free' }));
    try {
      loadKnowledgeBaseFromFile(kbFile);
      throw new Error('expected failure');
    } catch (err) {
      expect(err).toBeInstanceOf(KnowledgeBaseError);
      expect((err as KnowledgeBaseError).issues[0]?.path).toBe('basePremium');
    }
  });
});
