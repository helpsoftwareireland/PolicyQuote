import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { ApiErrorBody, QuoteRequest, QuoteResponse } from '../models/quote.models';

/** Base URL for the API. Empty = same origin (dev server proxies /policy → :3000). */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', { providedIn: 'root', factory: () => '' });

/** Thin HTTP boundary — the only place RxJS is used (BRD FR-12). */
@Injectable({ providedIn: 'root' })
export class QuoteApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  requestQuote(request: QuoteRequest): Observable<QuoteResponse> {
    return this.http.post<QuoteResponse>(`${this.baseUrl}/policy/quote`, request);
  }
}

const isApiErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as { error: unknown }).error === 'object' &&
  (value as { error: object | null }).error !== null;

/** Map any HTTP failure to a message a customer can act on. */
export function toUserMessage(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) return 'Something went wrong. Please try again.';
  if (err.status === 0) return 'Cannot reach the quote service. Please check your connection and try again.';
  if (isApiErrorBody(err.error)) {
    const { message, issues } = err.error.error;
    if (issues && issues.length > 0) {
      return `Please check your details: ${issues.map((i) => `${i.path} — ${i.message}`).join('; ')}.`;
    }
    return message;
  }
  return 'Something went wrong while generating your quote. Please try again.';
}
