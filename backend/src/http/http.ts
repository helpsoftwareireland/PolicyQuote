import type { FieldIssue } from '../errors';

/**
 * Minimal structural views of API Gateway events. Real `APIGatewayProxyEvent` (REST, v1) and
 * `APIGatewayProxyEventV2` (HTTP API) objects both satisfy these, and so does the local server.
 */
type Headers = Record<string, string | undefined> | null | undefined;

export interface RestApiEvent {
  readonly httpMethod: string;
  readonly path: string;
  readonly headers?: Headers;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
}

export interface HttpApiEvent {
  readonly rawPath: string;
  readonly requestContext: { readonly http: { readonly method: string } };
  readonly headers?: Headers;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
}

export type LambdaHttpEvent = RestApiEvent | HttpApiEvent;

/** Compatible with APIGatewayProxyResult and APIGatewayProxyStructuredResultV2. */
export interface LambdaHttpResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface HttpRequest {
  readonly method: string;
  readonly path: string;
  readonly body: string | null;
}

export function toHttpRequest(event: LambdaHttpEvent): HttpRequest {
  const isRest = 'httpMethod' in event;
  const method = (isRest ? event.httpMethod : event.requestContext.http.method).toUpperCase();
  const rawPath = isRest ? event.path : event.rawPath;
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  const rawBody = event.body ?? null;
  const body = rawBody !== null && event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;
  return { method, path, body };
}

export const corsHeaders = (): Record<string, string> => ({
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

export function json(statusCode: number, payload: unknown, extraHeaders: Record<string, string> = {}): LambdaHttpResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(), ...extraHeaders },
    body: JSON.stringify(payload),
  };
}

export type ErrorCode = 'VALIDATION_ERROR' | 'BAD_REQUEST' | 'NOT_FOUND' | 'METHOD_NOT_ALLOWED' | 'INTERNAL_ERROR';

export const errorResponse = (
  statusCode: number,
  code: ErrorCode,
  message: string,
  issues?: readonly FieldIssue[],
  extraHeaders?: Record<string, string>,
): LambdaHttpResult => json(statusCode, { error: { code, message, ...(issues ? { issues } : {}) } }, extraHeaders);
