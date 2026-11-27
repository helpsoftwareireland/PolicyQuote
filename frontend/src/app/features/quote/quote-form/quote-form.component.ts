import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { merge } from 'rxjs';
import { PROPERTY_TYPES, type PropertyType, type QuoteRequest } from '../../../core/models/quote.models';

/** Same syntactic rule as the backend's Zod schema (BRD A-3). Server remains the source of truth. */
const UK_POSTCODE = /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/i;

const wholeNumber = (control: AbstractControl<number | null>): ValidationErrors | null =>
  control.value === null || Number.isInteger(control.value) ? null : { wholeNumber: true };

type FieldName = keyof QuoteRequest;

const FIELDS: readonly FieldName[] = ['customerName', 'age', 'propertyType', 'propertyValue', 'postcode', 'previousClaims'];

const MESSAGES: Readonly<Record<FieldName, Readonly<Record<string, string>>>> = {
  customerName: { required: 'Please enter your name', minlength: 'Name must be at least 2 characters', maxlength: 'Name is too long' },
  age: { required: 'Please enter your age', min: 'You must be 18 or over', max: 'Please enter a valid age', wholeNumber: 'Age must be a whole number' },
  propertyType: { required: 'Please choose a property type' },
  propertyValue: { required: 'Please enter the property value', min: 'Value must be greater than £0', max: 'Value is too high' },
  postcode: { required: 'Please enter your postcode', pattern: 'Please enter a valid UK postcode' },
  previousClaims: { required: 'Please enter 0 if you have no claims', min: 'Cannot be negative', max: 'Please enter a valid number', wholeNumber: 'Must be a whole number' },
};

interface Preset {
  readonly label: string;
  readonly value: QuoteRequest;
}

/** Sample profiles — one per band — for quick demos. */
const PRESETS: readonly Preset[] = [
  { label: 'Standard', value: { customerName: 'Alex Morgan', age: 40, propertyType: 'House', propertyValue: 300000, postcode: 'SW1A 1AA', previousClaims: 0 } },
  { label: 'Elevated', value: { customerName: 'Sam Patel', age: 30, propertyType: 'House', propertyValue: 300000, postcode: 'M1 1AE', previousClaims: 2 } },
  { label: 'High risk', value: { customerName: 'Jo Taylor', age: 22, propertyType: 'Flat', propertyValue: 800000, postcode: 'EX1 1AA', previousClaims: 3 } },
];

/**
 * Presentational form (BRD FR-01..04). Knows nothing about HTTP: emits a typed QuoteRequest.
 */
@Component({
  selector: 'pq-quote-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quote-form.component.html',
  styleUrl: './quote-form.component.css',
})
export class QuoteFormComponent {
  /** True while a quote request is in flight. */
  readonly busy = input(false);
  readonly quoteRequested = output<QuoteRequest>();

  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly propertyTypes = PROPERTY_TYPES;
  protected readonly presets = PRESETS;

  readonly form = this.fb.group({
    customerName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    age: this.fb.control<number | null>(null, [Validators.required, Validators.min(18), Validators.max(120), wholeNumber]),
    propertyType: this.fb.control<PropertyType>('House', Validators.required),
    propertyValue: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(100_000_000)]),
    postcode: ['', [Validators.required, Validators.pattern(UK_POSTCODE)]],
    previousClaims: this.fb.control<number | null>(0, [Validators.required, Validators.min(0), Validators.max(50), wholeNumber]),
  });

  /**
   * Bridge Reactive Forms into the signal graph (review G6). Reactive Forms state is not signal-native, so
   * every control's unified `events` stream (value, status, touched, pristine) feeds one signal.
   * Per-control streams are merged on purpose: a FormGroup only emits `touched` the *first* time any
   * child is touched (see `markAsTouched` in @angular/forms), so tabbing past a second empty field would
   * otherwise never surface its error. (Signal Forms, stable in v22, would make this bridge unnecessary.)
   */
  private readonly formChange = toSignal(
    merge(this.form.events, ...Object.values(this.form.controls).map((control) => control.events)),
    { initialValue: null },
  );

  /** Field → message, for touched invalid fields. The template reads only signals — no method calls. */
  protected readonly fieldErrors = computed((): Partial<Record<FieldName, string>> => {
    this.formChange();
    const errors: Partial<Record<FieldName, string>> = {};
    for (const field of FIELDS) {
      const control = this.form.controls[field];
      const key = control.touched && control.errors ? Object.keys(control.errors)[0] : undefined;
      if (key) errors[field] = MESSAGES[field][key] ?? 'Invalid value';
    }
    return errors;
  });

  readonly canSubmit = computed(() => {
    this.formChange();
    return this.form.valid && !this.busy();
  });

  protected applyPreset(preset: Preset): void {
    this.form.setValue({ ...preset.value });
    this.form.markAllAsTouched();
  }

  protected submit(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const { customerName, age, propertyType, propertyValue, postcode, previousClaims } = this.form.getRawValue();
    // Validators guarantee these are set; the check narrows the types without non-null assertions.
    if (age === null || propertyValue === null || previousClaims === null) return;
    this.quoteRequested.emit({
      customerName: customerName.trim(),
      age,
      propertyType,
      propertyValue,
      postcode: postcode.trim().toUpperCase(),
      previousClaims,
    });
  }
}
