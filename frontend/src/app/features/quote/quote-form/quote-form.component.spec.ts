import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { QuoteRequest } from '../../../core/models/quote.models';
import { REQUEST } from '../../../../testing/quote.fixtures';
import { QuoteFormComponent } from './quote-form.component';

describe('QuoteFormComponent (FR-01..04)', () => {
  let fixture: ComponentFixture<QuoteFormComponent>;
  let component: QuoteFormComponent;
  let host: HTMLElement;
  let emitted: QuoteRequest[];

  const submitButton = () => host.querySelector<HTMLButtonElement>('button[type="submit"]');
  const typeInto = async (id: string, value: string) => {
    const input = host.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`#${id} not found`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(QuoteFormComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    emitted = [];
    component.quoteRequested.subscribe((request) => emitted.push(request));
    await fixture.whenStable();
  });

  it('renders every field required by the brief', () => {
    for (const id of ['customerName', 'age', 'postcode', 'propertyValue', 'previousClaims']) {
      expect(host.querySelector(`#${id}`)).not.toBeNull();
    }
    const types = Array.from(host.querySelectorAll<HTMLElement>('.segmented__option')).map((o) => o.textContent?.trim());
    expect(types).toEqual(['House', 'Flat', 'Bungalow']);
  });

  it('property type radios are bound to the form control', async () => {
    const radios = host.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios[0]?.checked).toBe(true); // House by default
    radios[1]?.click();
    await fixture.whenStable();
    expect(component.form.controls.propertyType.value).toBe('Flat');
  });

  it('disables submit while the form is invalid', () => {
    expect(component.canSubmit()).toBe(false);
    expect(submitButton()?.disabled).toBe(true);
  });

  it('enables submit once valid and emits a typed, normalised QuoteRequest', async () => {
    component.form.setValue({ ...REQUEST, customerName: '  Sam Patel ', postcode: 'm1 1ae' });
    await fixture.whenStable();

    expect(component.canSubmit()).toBe(true);
    expect(submitButton()?.disabled).toBe(false);

    submitButton()?.click();
    expect(emitted).toEqual([{ ...REQUEST, customerName: 'Sam Patel', postcode: 'M1 1AE' }]);
  });

  it('stays disabled while busy, even when valid', async () => {
    component.form.setValue(REQUEST);
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();

    expect(component.canSubmit()).toBe(false);
    expect(submitButton()?.disabled).toBe(true);
    expect(submitButton()?.textContent).toContain('Calculating');
  });

  it.each([
    ['age', '17', 'You must be 18 or over'],
    ['age', '30.5', 'Age must be a whole number'],
    ['postcode', '12345', 'Please enter a valid UK postcode'],
    ['propertyValue', '0', 'Value must be greater than £0'],
    ['previousClaims', '-1', 'Cannot be negative'],
    ['customerName', 'A', 'Name must be at least 2 characters'],
  ])('shows an inline error for %s = %p once touched', async (id, value, message) => {
    await typeInto(id, value);
    expect(host.querySelector(`#${id}-error`)?.textContent?.trim()).toBe(message);
    expect(host.querySelector(`#${id}`)?.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the error of a second empty field tabbed past after another field was touched', async () => {
    // Regression guard for the form.events bridge: once the group is touched, it emits no further
    // touched events — only the child control does. Field errors are signals, so this must still update.
    await typeInto('customerName', 'Sam Patel');
    host.querySelector<HTMLInputElement>('#age')?.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(host.querySelector('#age-error')?.textContent?.trim()).toBe('Please enter your age');
  });

  it('binds the DOM to the reactive form', async () => {
    await typeInto('age', '45');
    expect(component.form.controls.age.value).toBe(45);
  });

  it('sample presets fill a valid profile', async () => {
    const chips = Array.from(host.querySelectorAll<HTMLButtonElement>('.chip'));
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['Standard', 'Elevated', 'High risk']);

    chips[2]?.click();
    await fixture.whenStable();
    expect(component.form.valid).toBe(true);
    expect(component.form.controls.propertyType.value).toBe('Flat');
  });
});
