import type { Context } from 'aws-lambda';
import { BadRequestError, errorMessage, KnowledgeBaseError, ValidationError } from './errors';
import { corsHeaders, errorResponse, json, toHttpRequest, type HttpRequest, type LambdaHttpEvent, type LambdaHttpResult } from './http/http';
import { getKnowledgeBase } from './kb/kb.loader';
import { logger } from './logger';
import { createQuote } from './quote/quote.service';

/**
 * AWS Lambda entry point (BRD FR-20). Works behind API Gateway REST (v1) or HTTP API (v2),
 * and is reused verbatim by the local/Fargate server in server.ts.
 */

type RouteHandler = (request: HttpRequest) => LambdaHttpResult;

function parseJsonBody(body: string | null): unknown {
  if (body === null || body.trim() === '') throw new BadRequestError('Request body is required');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new BadRequestError('Request body must be valid JSON');
  }
}

const postQuote: RouteHandler = (request) => json(200, createQuote(parseJsonBody(request.body), getKnowledgeBase()));

const getHealth: RouteHandler = () => {
  const kb = getKnowledgeBase();
  return json(200, { status: 'ok', kbVersion: kb.version, schemaVersion: kb.schemaVersion, factorCount: kb.factors.length });
};

/** Route table: path → method → handler. */
const ROUTES: Readonly<Record<string, Readonly<Record<string, RouteHandler>>>> = {
  '/policy/quote': { POST: postQuote },
  '/health': { GET: getHealth },
};

function route(request: HttpRequest): LambdaHttpResult {
  const methods = ROUTES[request.path];
  if (!methods) return errorResponse(404, 'NOT_FOUND', `No route for ${request.path}`);
  if (request.method === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  const routeHandler = methods[request.method];
  if (!routeHandler) {
    const allow = [...Object.keys(methods), 'OPTIONS'].join(', ');
    return errorResponse(405, 'METHOD_NOT_ALLOWED', `${request.method} not allowed on ${request.path}`, undefined, { Allow: allow });
  }
  return routeHandler(request);
}

function toErrorResult(err: unknown, requestId: string | undefined): LambdaHttpResult {
  if (err instanceof ValidationError) return errorResponse(400, 'VALIDATION_ERROR', err.message, err.issues);
  if (err instanceof BadRequestError) return errorResponse(400, 'BAD_REQUEST', err.message);
  // KB and unexpected errors: log details server-side, return a generic message (BRD FR-21, NFR-08).
  const kbIssues = err instanceof KnowledgeBaseError ? err.issues : undefined;
  logger.error('Unhandled error', { requestId, error: errorMessage(err), kbIssues });
  return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong while generating your quote. Please try again.');
}

export const handler = async (
  event: LambdaHttpEvent,
  context?: Pick<Context, 'awsRequestId'>,
): Promise<LambdaHttpResult> => {
  try {
    // Inside the try: a malformed event (e.g. a non-HTTP trigger) must become a 500, not an unhandled rejection.
    return route(toHttpRequest(event));
  } catch (err) {
    return toErrorResult(err, context?.awsRequestId);
  }
};
