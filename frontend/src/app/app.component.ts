import { ChangeDetectionStrategy, Component } from '@angular/core';
import { QuotePageComponent } from './features/quote/quote-page/quote-page.component';

@Component({
  selector: 'pq-root',
  imports: [QuotePageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="masthead">
      <div class="masthead__inner">
        <span class="logo" aria-hidden="true">PQ</span>
        <div>
          <h1 class="masthead__title">PolicyQuote</h1>
          <p class="masthead__tag">Instant home insurance estimate with a transparent risk assessment</p>
        </div>
      </div>
    </header>
    <main class="container">
      <pq-quote-page />
    </main>
  `,
})
export class AppComponent {}
