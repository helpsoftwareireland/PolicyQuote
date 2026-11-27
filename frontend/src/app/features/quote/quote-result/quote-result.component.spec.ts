import { TestBed } from '@angular/core/testing';
import type { QuoteResponse } from '../../../core/models/quote.models';
import { ELEVATED_QUOTE, HIGH_RISK_QUOTE, STANDARD_QUOTE } from '../../../../testing/quote.fixtures';
import { QuoteResultComponent } from './quote-result.component';

describe('QuoteResultComponent (FR-05..08, FR-11)', () => {
  async function render(quote: QuoteResponse): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(QuoteResultComponent);
    fixture.componentRef.setInput('quote', quote);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (host: HTMLElement, selector: string) => host.querySelector(selector)?.textContent?.trim();

  it('shows monthly and annual premiums in GBP', async () => {
    const host = await render(ELEVATED_QUOTE);
    expect(text(host, '[data-testid="monthly-premium"]')).toBe('£45.00');
    expect(text(host, '[data-testid="annual-premium"]')).toBe('£540.00');
  });

  it.each([
    [STANDARD_QUOTE, 'STANDARD'],
    [ELEVATED_QUOTE, 'ELEVATED'],
    [HIGH_RISK_QUOTE, 'HIGH RISK'],
  ])('renders the risk band badge for %#', async (quote, label) => {
    const host = await render(quote);
    expect(text(host, 'pq-risk-band-badge')).toBe(label);
  });

  it('shows the plain-English risk summary', async () => {
    const host = await render(ELEVATED_QUOTE);
    expect(text(host, '[data-testid="risk-summary"]')).toBe(ELEVATED_QUOTE.riskSummary);
  });

  it('lists every applied factor using its KB description and points', async () => {
    const host = await render(HIGH_RISK_QUOTE);
    const items = Array.from(host.querySelectorAll<HTMLElement>('[data-factor-id]'));

    expect(items.map((li) => li.dataset['factorId'])).toEqual(HIGH_RISK_QUOTE.appliedFactors.map((f) => f.id));
    expect(items[1]?.textContent).toContain('3 or more previous claims');
    expect(items[1]?.textContent).toContain('× 3');
    expect(items[1]?.textContent).toContain('+90');
    expect(text(host, '.factor--total .factor__points')).toBe('180');
  });

  it('says so when no factors applied', async () => {
    const host = await render(STANDARD_QUOTE);
    expect(host.querySelectorAll('[data-factor-id]')).toHaveLength(0);
    expect(text(host, '.factors__empty')).toContain('No risk factors applied');
  });

  it('shows the premium breakdown and the KB version used', async () => {
    const host = await render(ELEVATED_QUOTE);
    expect(text(host, '.breakdown')).toContain('× 1.5');
    expect(text(host, '.breakdown')).toContain('× 1.2');
    expect(text(host, '.result__foot')).toContain('v1.1.0');
  });
});
