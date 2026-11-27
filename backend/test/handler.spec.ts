import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handler } from '../src/handler';
import type { RestApiEvent } from '../src/http/http';
import { resetKnowledgeBaseCache } from '../src/kb/kb.loader';
import type { QuoteResponse } from '../src/quote/quote.types';
import { baseInput } from './fixtures/kb.fixture';

const restEvent = (method: string, eventPath: string, body?: unknown): RestApiEvent => ({
  httpMethod: method,
  path: eventPath,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
});

interface ErrorBody {
  error: { code: string; message: string; issues?: { path: string; message: string }[] };
}

const parse = <T>(body: string): T => JSON.parse(body) as T;

describe('Lambda handler(event, context) (FR-12, FR-20..22)', () => {
  beforeEach(() => resetKnowledgeBaseCache());

  it('is compatible with real API Gateway REST (v1) and HTTP API (v2) event types', async () => {
    // Compile-time check: AWS event types are accepted without casts.
    const v1 = { httpMethod: 'POST', path: '/policy/quote', body: JSON.stringify(baseInput()), isBase64Encoded: false, headers: {} } as Partial<APIGatewayProxyEvent> as APIGatewayProxyEvent;
    const v2 = { rawPath: '/policy/quote', requestContext: { http: { method: 'POST' } }, body: JSON.stringify(baseInput()), isBase64Encoded: false, headers: {} } as unknown as APIGatewayProxyEventV2;

    expect((await handler(v1, { awsRequestId: '1' })).statusCode).toBe(200);
    expect((await handler(v2, { awsRequestId: '2' })).statusCode).toBe(200);
  });

  it('200: returns the full quote contract priced from the real KB', async () => {
    const res = await handler(restEvent('POST', '/policy/quote', baseInput({ previousClaims: 2, age: 30 })));
    const body = parse<QuoteResponse>(res.body);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toContain('application/json');
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(Object.keys(body).sort()).toEqual(
      [
        'annualPremium',
        'appliedFactors',
        'coverageDetails',
        'currency',
        'kbVersion',
        'monthlyPremium',
        'riskBand',
        'riskBandLabel',
        'riskScore',
        'riskSummary',
      ].sort(),
    );
    expect(body).toMatchObject({ riskBand: 'ELEVATED', riskScore: 30, annualPremium: 540, monthlyPremium: 45 });
    expect(body.kbVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('decodes base64-encoded bodies', async () => {
    const res = await handler({
      ...restEvent('POST', '/policy/quote'),
      body: Buffer.from(JSON.stringify(baseInput())).toString('base64'),
      isBase64Encoded: true,
    });
    expect(res.statusCode).toBe(200);
  });

  it('tolerates a trailing slash', async () => {
    expect((await handler(restEvent('POST', '/policy/quote/', baseInput()))).statusCode).toBe(200);
  });

  it('400 VALIDATION_ERROR with field-level issues', async () => {
    const res = await handler(restEvent('POST', '/policy/quote', { ...baseInput(), age: 'abc', postcode: 'nope' }));
    const body = parse<ErrorBody>(res.body);

    expect(res.statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.issues?.map((i) => i.path)).toEqual(expect.arrayContaining(['age', 'postcode']));
  });

  it('400 BAD_REQUEST for malformed JSON and empty body', async () => {
    const malformed = await handler(restEvent('POST', '/policy/quote', '{"age": '));
    const empty = await handler(restEvent('POST', '/policy/quote'));
    expect(malformed.statusCode).toBe(400);
    expect(parse<ErrorBody>(malformed.body).error.code).toBe('BAD_REQUEST');
    expect(empty.statusCode).toBe(400);
  });

  it('404 for unknown routes, 405 (with Allow) for wrong methods', async () => {
    const notFound = await handler(restEvent('GET', '/nope'));
    const wrongMethod = await handler(restEvent('GET', '/policy/quote'));
    expect(notFound.statusCode).toBe(404);
    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers.Allow).toBe('POST, OPTIONS');
  });

  it('204 for CORS preflight', async () => {
    const res = await handler(restEvent('OPTIONS', '/policy/quote'));
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('honours CORS_ORIGIN', async () => {
    process.env.CORS_ORIGIN = 'https://quotes.example.com';
    try {
      const res = await handler(restEvent('OPTIONS', '/policy/quote'));
      expect(res.headers['Access-Control-Allow-Origin']).toBe('https://quotes.example.com');
    } finally {
      delete process.env.CORS_ORIGIN;
    }
  });

  it('GET /health returns status and active KB version', async () => {
    const res = await handler(restEvent('GET', '/health'));
    const body = parse<{ status: string; kbVersion: string; schemaVersion: number; factorCount: number }>(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.schemaVersion).toBe(1);
    expect(body.factorCount).toBeGreaterThan(0);
  });

  it('500 (not an unhandled rejection) for a malformed, non-HTTP event', async () => {
    const malformed = { detail: 'from EventBridge' } as unknown as RestApiEvent;
    const res = await handler(malformed);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });

  it('500 with a generic message (no internals leaked) when the KB is broken', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kb-bad-'));
    const badKb = path.join(dir, 'risk-kb.json');
    writeFileSync(badKb, '{"schemaVersion": 1}');
    process.env.KB_PATH = badKb;
    try {
      const res = await handler(restEvent('POST', '/policy/quote', baseInput()));
      const body = parse<ErrorBody>(res.body);
      expect(res.statusCode).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body).not.toMatch(/schemaVersion|risk-kb|stack/i);
    } finally {
      delete process.env.KB_PATH;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
