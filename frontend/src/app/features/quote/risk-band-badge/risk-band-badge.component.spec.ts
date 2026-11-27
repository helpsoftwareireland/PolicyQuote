import { TestBed } from '@angular/core/testing';
import { RiskBandBadgeComponent } from './risk-band-badge.component';

describe('RiskBandBadgeComponent (FR-06, FR-09)', () => {
  async function renderBadge(riskBand: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(RiskBandBadgeComponent);
    fixture.componentRef.setInput('riskBand', riskBand);
    await fixture.whenStable();
    const badge = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.badge');
    if (!badge) throw new Error('badge not rendered');
    return badge;
  }

  it.each([
    ['STANDARD', 'STANDARD', 'badge--standard'],
    ['ELEVATED', 'ELEVATED', 'badge--elevated'],
    ['HIGH_RISK', 'HIGH RISK', 'badge--high'],
  ])('%s renders "%s" with class %s', async (band, text, cssClass) => {
    const badge = await renderBadge(band);
    expect(badge.textContent?.trim()).toBe(text);
    expect(badge.classList).toContain(cssClass);
    expect(badge.getAttribute('aria-label')).toBe(`Risk band: ${text}`);
  });

  it('falls back to a neutral tone for a band the KB adds later', async () => {
    const badge = await renderBadge('SEVERE_RISK');
    expect(badge.textContent?.trim()).toBe('SEVERE RISK');
    expect(badge.classList).toContain('badge--neutral');
  });

  it('updates when the riskBand input changes (signal input)', async () => {
    const fixture = TestBed.createComponent(RiskBandBadgeComponent);
    fixture.componentRef.setInput('riskBand', 'STANDARD');
    await fixture.whenStable();
    fixture.componentRef.setInput('riskBand', 'HIGH_RISK');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('HIGH RISK');
  });
});
