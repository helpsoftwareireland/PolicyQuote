import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, effect, inject, viewChild } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import type { QuoteRequest } from '../../../core/models/quote.models';
import { QuoteStore } from '../../../core/state/quote.store';
import { QuoteFormComponent } from '../quote-form/quote-form.component';
import { QuoteResultComponent } from '../quote-result/quote-result.component';

const BASE_TITLE = 'PolicyQuote';

/**
 * Container: wires the presentational form/result to the signal store (BRD FR-10).
 */
@Component({
  selector: 'pq-quote-page',
  imports: [QuoteFormComponent, QuoteResultComponent],
  providers: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quote-page.component.html',
  styleUrl: './quote-page.component.css',
})
export class QuotePageComponent {
  protected readonly store = inject(QuoteStore);
  private readonly title = inject(Title);
  private readonly currency = inject(CurrencyPipe);
  private readonly resultPanel = viewChild<ElementRef<HTMLElement>>('resultPanel');

  constructor() {
    // Side effect 1: keep the browser tab title in sync with the latest quote.
    effect(() => {
      const quote = this.store.quoteResult();
      const monthly = quote ? this.currency.transform(quote.monthlyPremium, quote.currency, 'symbol', '1.2-2') : null;
      this.title.setTitle(monthly ? `${monthly}/month · ${BASE_TITLE}` : BASE_TITLE);
    });

    // Side effect 2 (a11y): when a new quote arrives, move focus to it so keyboard and
    // screen-reader users land on the result (important on mobile where it renders below the form).
    // afterRenderEffect (not effect) because the heading only exists once the result has rendered.
    afterRenderEffect(() => {
      if (!this.store.quoteResult()) return;
      const heading = this.resultPanel()?.nativeElement.querySelector<HTMLElement>('#result-title');
      heading?.focus({ preventScroll: false });
    });
  }

  protected onQuoteRequested(request: QuoteRequest): void {
    this.store.requestQuote(request);
  }
}
