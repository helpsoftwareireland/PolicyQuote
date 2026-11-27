import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handler } from './handler';
import type { RestApiEvent } from './http/http';
import { getKnowledgeBase, resolveKbPath } from './kb/kb.loader';
import { logger } from './logger';

/**
 * Local / Fargate adapter: plain HTTP → API Gateway-shaped event → the same Lambda handler.
 * Contains no business logic.
 */

const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY_BYTES = 10 * 1024;

class PayloadTooLargeError extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop buffering but keep draining so the 413 can still be written (destroying the socket
        // here would leave the client with an empty reply). The response closes the connection.
        req.removeAllListeners('data');
        req.resume();
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const started = performance.now();
  const url = new URL(req.url ?? '/', 'http://localhost');
  let statusCode = 500;
  try {
    const body = await readBody(req);
    const event: RestApiEvent = {
      httpMethod: req.method ?? 'GET',
      path: url.pathname,
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])),
      body: body.length > 0 ? body : null,
      isBase64Encoded: false,
    };
    const result = await handler(event, { awsRequestId: randomUUID() });
    statusCode = result.statusCode;
    res.writeHead(result.statusCode, result.headers).end(result.body);
  } catch (err) {
    statusCode = err instanceof PayloadTooLargeError ? 413 : 500;
    if (!res.headersSent) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json', Connection: 'close' }).end(
        JSON.stringify({ error: { code: statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR', message: 'Request failed' } }),
      );
    }
  } finally {
    logger.info('request', { method: req.method, path: url.pathname, statusCode, ms: Math.round(performance.now() - started) });
  }
}

// Fail fast at boot if the KB is invalid, rather than on the first customer request.
const kb = getKnowledgeBase();
createServer((req, res) => void onRequest(req, res)).listen(PORT, () => {
  logger.info('PolicyQuote API listening', { url: `http://localhost:${PORT}`, kbPath: resolveKbPath(), kbVersion: kb.version });
});
