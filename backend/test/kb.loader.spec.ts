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
  selectKbFile,
} from '../src/kb/kb.loader';
import { BASE_KB_JSON } from './fixtures/kb.fixture';

describe('KB loader (KB-07, KB-09)', () => {
  let dir: string;
  let kbFile: string;
  let tick = Date.now() / 1000;

  /** Write a file and force a distinct mtime (filesystems can have coarse timestamps). */
  const writeKbAt = (file: string, content: string): void => {
    writeFileSync(file, content);
    tick += 10;
    utimesSync(file, tick, tick);
  };
  const writeKb = (content: string): void => writeKbAt(kbFile, content);
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

  describe('KB channel: breaking schema changes without redeploying the Lambda (G2)', () => {
    const v1Kb = (version: string) => JSON.stringify({ ...BASE_KB_JSON, schemaVersion: 1, version });
    // A future, breaking shape this engine cannot read (it is never parsed by a v1 engine).
    const v2Kb = JSON.stringify({ schemaVersion: 2, version: '2.0.0', pricing: { base: 300 }, rules: [] });
    const put = (name: string, content: string) => writeFileSync(path.join(dir, name), content);

    it('selects the newest schema version the engine supports', () => {
      put('risk-kb.v1.json', v1Kb('1.4.0'));
      put('risk-kb.v2.json', v2Kb);
      put('README.txt', 'ignored');
      expect(path.basename(selectKbFile(dir, [1]))).toBe('risk-kb.v1.json');
      expect(path.basename(selectKbFile(dir, [1, 2]))).toBe('risk-kb.v2.json');
    });

    it('rollout: publishing v2 next to v1 does not disturb an already-deployed v1 engine', () => {
      put('risk-kb.v1.json', v1Kb('1.4.0'));
      process.env.KB_PATH = dir; // channel directory, as configured on the deployed Lambda
      expect(getKnowledgeBase().version).toBe('1.4.0');

      put('risk-kb.v2.json', v2Kb); // the pipeline publishes the breaking schema alongside
      expect(getKnowledgeBase().version).toBe('1.4.0'); // same engine, no redeploy, still pricing
      expect(getKnowledgeBaseStatus().kbStatus).toBe('current');

      writeKbAt(path.join(dir, 'risk-kb.v1.json'), v1Kb('1.5.0')); // v1 rules can still be patched
      expect(getKnowledgeBase().version).toBe('1.5.0');
    });

    it('fails clearly when the channel has no version this engine supports', () => {
      put('risk-kb.v2.json', v2Kb);
      expect(() => selectKbFile(dir, [1])).toThrow(/No KB .* supported schema version\(s\) 1/);
    });

    it('keeps the last-known-good KB if the channel is emptied mid-publish', () => {
      put('risk-kb.v1.json', v1Kb('1.4.0'));
      process.env.KB_PATH = dir;
      getKnowledgeBase();
      unlinkSync(path.join(dir, 'risk-kb.v1.json'));
      expect(getKnowledgeBase().version).toBe('1.4.0');
      expect(getKnowledgeBaseStatus().kbStatus).toBe('stale');
    });

    it('rejects a file whose name and schemaVersion disagree', () => {
      const mislabelled = path.join(dir, 'risk-kb.v2.json');
      writeFileSync(mislabelled, v1Kb('1.4.0'));
      expect(() => loadKnowledgeBaseFromFile(mislabelled)).toThrow(/risk-kb\.v2\.json declares schemaVersion 1/);
    });
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
