import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By, Title } from '@angular/platform-browser';
import { ELEVATED_QUOTE, REQUEST } from '../../../../testing/quote.fixtures';
import { QuoteFormComponent } from '../quote-form/quote-form.component';
import { QuotePageComponent } from './quote-page.component';

describe('QuotePageComponent (integration: form → store → result)', () => {
  let fixture: ComponentFixture<QuotePageComponent>;
  let host: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    fixture = TestBed.createComponent(QuotePageComponent);
    host = fixture.nativeElement as HTMLElement;
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function submitValidForm(): Promise<void> {
    const form = fixture.debugElement.query(By.directive(QuoteFormComponent)).componentInstance as QuoteFormComponent;
    form.form.setValue(REQUEST);
    await fixture.whenStable();
    host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await fixture.whenStable();
  }

  it('shows the empty state before any quote', () => {
    expect(host.textContent).toContain('Your instant estimate will appear here');
  });

  it('shows loading, then the result, and updates the document title via effect()', async () => {
    await submitValidForm();
    expect(host.querySelector('[data-testid="loading"]')).not.toBeNull();
    expect(host.querySelector('.card--result')?.getAttribute('aria-busy')).toBe('true');

    http.expectOne('/policy/quote').flush(ELEVATED_QUOTE);
    await fixture.whenStable();

    expect(host.querySelector('[data-testid="loading"]')).toBeNull();
    expect(host.querySelector('[data-testid="monthly-premium"]')?.textContent?.trim()).toBe('£45.00');
    expect(host.querySelector('[data-factor-id="previous_claims_low"]')).not.toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe('£45.00/month · PolicyQuote');
  });

  it('moves focus to the result heading when a quote arrives (afterRenderEffect)', async () => {
    await submitValidForm();
    http.expectOne('/policy/quote').flush(ELEVATED_QUOTE);
    await fixture.whenStable();
    expect(document.activeElement?.id).toBe('result-title');
  });

  it('warns when the quote was priced with a stale KB (X-KB-Status: stale)', async () => {
    await submitValidForm();
    http.expectOne('/policy/quote').flush(ELEVATED_QUOTE, { headers: { 'X-KB-Status': 'stale' } });
    await fixture.whenStable();

    const notice = host.querySelector('[data-testid="kb-stale"]');
    expect(notice?.textContent).toContain('rule-set edit was rejected');
    expect(notice?.textContent).toContain('v1.1.0');
    expect(host.querySelector('[data-testid="monthly-premium"]')).not.toBeNull();
  });

  it('shows a dismissible error banner on failure', async () => {
    await submitValidForm();
    http.expectOne('/policy/quote').flush(
      { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong while generating your quote.' } },
      { status: 500, statusText: 'Server Error' },
    );
    await fixture.whenStable();

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Something went wrong');

    host.querySelector<HTMLButtonElement>('.alert__close')?.click();
    await fixture.whenStable();
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
