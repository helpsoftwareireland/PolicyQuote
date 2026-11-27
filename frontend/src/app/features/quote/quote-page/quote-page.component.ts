import { formatCurrency, getCurrencySymbol } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  LOCALE_ID,
  afterRenderEffect,
  effect,
  inject,
  viewChild,
} from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quote-page.component.html',
  styleUrl: './quote-page.component.css',
})
export class QuotePageComponent {
  protected readonly store = inject(QuoteStore);
  private readonly title = inject(Title);
  private readonly locale = inject(LOCALE_ID);
  private readonly resultPanel = viewChild<ElementRef<HTMLElement>>('resultPanel');

  constructor() {
    // Side effect 1: keep the browser tab title in sync with the latest quote.
    effect(() => {
      const quote = this.store.quoteResult();
      if (!quote) {
        this.title.setTitle(BASE_TITLE);
        return;
      }
      const symbol = getCurrencySymbol(quote.currency, 'narrow', this.locale);
      const monthly = formatCurrency(quote.monthlyPremium, this.locale, symbol, quote.currency, '1.2-2');
      this.title.setTitle(`${monthly}/month · ${BASE_TITLE}`);
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
