import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiErrorBody, QuoteRequest, QuoteResponse } from '../models/quote.models';

/** Base URL for the API. Empty = same origin (dev server proxies /policy → :3000). */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', { providedIn: 'root', factory: () => '' });

/** Thin HTTP boundary — the only place RxJS is used (BRD FR-12). */
@Injectable({ providedIn: 'root' })
export class QuoteApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  requestQuote(request: QuoteRequest): Observable<QuoteResult> {
    return this.http.post<QuoteResponse>(`${this.baseUrl}/policy/quote`, request, { observe: 'response' }).pipe(
      map((response) => {
        if (!response.body) throw new Error('Empty quote response');
        return { quote: response.body, kbStale: response.headers.get(KB_STATUS_HEADER) === 'stale' };
      }),
    );
  }
}

/** Set by the API when the KB on disk was rejected and the last-known-good rules priced the quote. */
export const KB_STATUS_HEADER = 'X-KB-Status';

export interface QuoteResult {
  readonly quote: QuoteResponse;
  /** True when the server is pricing with an older rule set because the latest KB edit failed validation. */
  readonly kbStale: boolean;
}

const isApiErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as { error: unknown }).error === 'object' &&
  (value as { error: object | null }).error !== null;

/**
 * "Service unreachable" statuses: 0 = the browser got no response at all; 502/503/504 = a proxy or
 * gateway in front of the API (Angular dev server, CloudFront, API Gateway) could not reach it.
 * The API itself never returns these, so they always mean "not reachable", not "request rejected".
 */
const UNREACHABLE_STATUSES: ReadonlySet<number> = new Set([0, 502, 503, 504]);

export const UNREACHABLE_MESSAGE = 'Cannot reach the quote service right now. Please try again in a moment.';

/** Map any HTTP failure to a message a customer can act on. */
export function toUserMessage(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) return 'Something went wrong. Please try again.';
  if (UNREACHABLE_STATUSES.has(err.status)) return UNREACHABLE_MESSAGE;
  if (isApiErrorBody(err.error)) {
    const { message, issues } = err.error.error;
    if (issues && issues.length > 0) {
      return `Please check your details: ${issues.map((i) => `${i.path} — ${i.message}`).join('; ')}.`;
    }
    return message;
  }
  return 'Something went wrong while generating your quote. Please try again.';
}
