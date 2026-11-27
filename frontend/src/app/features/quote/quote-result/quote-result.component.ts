import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { QuoteResponse } from '../../../core/models/quote.models';
import { RiskBandBadgeComponent } from '../risk-band-badge/risk-band-badge.component';

/**
 * Presentational quote result (BRD FR-05..08, FR-11). Every factor line comes from the API's
 * `appliedFactors`, whose text is the KB `description` — the UI hardcodes no rule wording.
 */
@Component({
  selector: 'pq-quote-result',
  imports: [CurrencyPipe, DecimalPipe, RiskBandBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quote-result.component.html',
  styleUrl: './quote-result.component.css',
})
export class QuoteResultComponent {
  readonly quote = input.required<QuoteResponse>();

  protected readonly factors = computed(() => this.quote().appliedFactors);
  protected readonly totalPoints = computed(() => this.factors().reduce((sum, f) => sum + f.points, 0));
  protected readonly bandTone = computed(() => this.quote().riskBand.toLowerCase().replace(/_/g, '-'));
}
