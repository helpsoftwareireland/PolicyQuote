import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ELEVATED_QUOTE, HIGH_RISK_QUOTE, REQUEST } from '../../../testing/quote.fixtures';
import { UNREACHABLE_MESSAGE } from '../services/quote-api.service';
import { QuoteStore } from './quote.store';

describe('QuoteStore (signals: loading, quoteResult, errorMessage)', () => {
  let store: QuoteStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(QuoteStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts empty', () => {
    expect(store.loading()).toBe(false);
    expect(store.quoteResult()).toBeNull();
    expect(store.errorMessage()).toBeNull();
    expect(store.hasResult()).toBe(false);
    expect(store.appliedFactors()).toEqual([]);
  });

  it('POSTs to /policy/quote, toggles loading, and stores the result', () => {
    store.requestQuote(REQUEST);
    expect(store.loading()).toBe(true);

    const req = http.expectOne('/policy/quote');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(REQUEST);
    req.flush(ELEVATED_QUOTE);

    expect(store.loading()).toBe(false);
    expect(store.quoteResult()).toEqual(ELEVATED_QUOTE);
    expect(store.hasResult()).toBe(true);
  });

  it('derives appliedFactors and totalFactorPoints with computed()', () => {
    store.requestQuote(REQUEST);
    http.expectOne('/policy/quote').flush(HIGH_RISK_QUOTE);

    expect(store.appliedFactors().map((f) => f.id)).toContain('flat_high_value');
    expect(store.totalFactorPoints()).toBe(180);
  });

  it('maps a 400 validation response to a readable, field-level message', () => {
    store.requestQuote(REQUEST);
    http.expectOne('/policy/quote').flush(
      { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', issues: [{ path: 'age', message: 'Minimum age is 18' }] } },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(store.loading()).toBe(false);
    expect(store.quoteResult()).toBeNull();
    expect(store.errorMessage()).toBe('Please check your details: age — Minimum age is 18.');
  });

  it('uses the server message for non-validation errors', () => {
    store.requestQuote(REQUEST);
    http
      .expectOne('/policy/quote')
      .flush({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong while generating your quote.' } }, { status: 500, statusText: 'Server Error' });
    expect(store.errorMessage()).toBe('Something went wrong while generating your quote.');
  });

  it('explains when the API is unreachable (network failure, status 0)', () => {
    store.requestQuote(REQUEST);
    http.expectOne('/policy/quote').error(new ProgressEvent('error'));
    expect(store.errorMessage()).toBe(UNREACHABLE_MESSAGE);
  });

  // Regression (DEF-3): behind a proxy/gateway a dead backend is a 502/503/504 with a non-JSON body,
  // which used to fall through to the generic "Something went wrong" message.
  it.each([
    [502, 'Bad Gateway'],
    [503, 'Service Unavailable'],
    [504, 'Gateway Timeout'],
  ])('treats a gateway %i (%s) as "service unreachable"', (status, statusText) => {
    store.requestQuote(REQUEST);
    http.expectOne('/policy/quote').flush('Error occurred while trying to proxy', { status, statusText });
    expect(store.errorMessage()).toBe(UNREACHABLE_MESSAGE);
    expect(store.loading()).toBe(false);
  });

  it('falls back to a generic message for an unexpected non-JSON error', () => {
    store.requestQuote(REQUEST);
    http.expectOne('/policy/quote').flush('<html>teapot</html>', { status: 418, statusText: "I'm a teapot" });
    expect(store.errorMessage()).toBe('Something went wrong while generating your quote. Please try again.');
  });

  it('clears a previous error when a new request starts, and dismissError() clears it', () => {
    store.requestQuote(REQUEST);
    http.expectOne('/policy/quote').error(new ProgressEvent('error'));
    expect(store.errorMessage()).not.toBeNull();

    store.requestQuote(REQUEST);
    expect(store.errorMessage()).toBeNull();
    http.expectOne('/policy/quote').error(new ProgressEvent('error'));
    store.dismissError();
    expect(store.errorMessage()).toBeNull();
  });

  it('latest request wins: an in-flight request is cancelled by a new one', () => {
    store.requestQuote(REQUEST);
    store.requestQuote({ ...REQUEST, age: 22 });

    const [first, second] = http.match('/policy/quote');
    expect(first?.cancelled).toBe(true);
    expect(store.loading()).toBe(true);

    second?.flush(HIGH_RISK_QUOTE);
    expect(store.quoteResult()?.riskBand).toBe('HIGH_RISK');
    expect(store.loading()).toBe(false);
  });
});
