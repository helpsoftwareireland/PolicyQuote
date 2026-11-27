import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RiskBand } from '../../../core/models/quote.models';
import { riskBandTone } from '../../../core/models/risk-band-tone';

/**
 * Reusable risk band badge (BRD FR-06, FR-09). Colour *and* text, never colour alone (NFR-07).
 * Unknown band ids (a KB can add bands) render with a neutral tone instead of breaking.
 */
@Component({
  selector: 'pq-risk-band-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'badge badge--' + tone()" role="status" [attr.aria-label]="'Risk band: ' + text()">
    <span class="badge__dot" aria-hidden="true"></span>{{ text() }}
  </span>`,
  styleUrl: './risk-band-badge.component.css',
})
export class RiskBandBadgeComponent {
  readonly riskBand = input.required<RiskBand>();

  /** HIGH_RISK → "HIGH RISK" — matches the wording in the brief. */
  protected readonly text = computed(() => this.riskBand().replace(/_/g, ' ').toUpperCase());
  protected readonly tone = computed(() => riskBandTone(this.riskBand()));
}
