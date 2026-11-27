import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { finalize, type Subscription } from 'rxjs';
import type { AppliedFactor, QuoteRequest, QuoteResponse } from '../models/quote.models';
import { QuoteApiService, toUserMessage } from '../services/quote-api.service';

/**
 * Signal-based UI state for the quote journey (BRD NFR-04).
 * Writable signals are private; components get read-only views and derived `computed` state.
 * No BehaviorSubject/Subject: RxJS stops at the HttpClient call.
 */
@Injectable({ providedIn: 'root' })
export class QuoteStore {
  private readonly api = inject(QuoteApiService);
  private inFlight: Subscription | undefined;

  private readonly _loading = signal(false);
  private readonly _quoteResult = signal<QuoteResponse | null>(null);
  private readonly _errorMessage = signal<string | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly quoteResult = this._quoteResult.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();

  readonly hasResult = computed(() => this._quoteResult() !== null);
  readonly appliedFactors = computed<readonly AppliedFactor[]>(() => this._quoteResult()?.appliedFactors ?? []);
  readonly totalFactorPoints = computed(() => this.appliedFactors().reduce((sum, f) => sum + f.points, 0));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.inFlight?.unsubscribe());
  }

  /** Latest request wins: a new submission cancels any request still in flight. */
  requestQuote(request: QuoteRequest): void {
    this.inFlight?.unsubscribe();
    this._loading.set(true);
    this._errorMessage.set(null);

    this.inFlight = this.api
      .requestQuote(request)
      .pipe(finalize(() => this._loading.set(false)))
      .subscribe({
        next: (quote) => this._quoteResult.set(quote),
        error: (err: unknown) => {
          this._quoteResult.set(null);
          this._errorMessage.set(toUserMessage(err));
        },
      });
  }

  dismissError(): void {
    this._errorMessage.set(null);
  }
}
