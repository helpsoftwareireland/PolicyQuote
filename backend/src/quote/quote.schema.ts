import { z } from 'zod';

/**
 * Request contract for POST /policy/quote (BRD FR-01, FR-13).
 * These limits are *input sanity* rules, not risk-scoring values — scoring lives in the KB.
 */
export const PROPERTY_TYPES = ['House', 'Flat', 'Bungalow'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

// Syntactic UK postcode check (BRD A-3). Space between outward/inward code optional on input.
const UK_POSTCODE = /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/;

/** Canonical form: uppercase, single space before the 3-char inward code. */
export const normalisePostcode = (raw: string): string => {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
};

export const QuoteRequestSchema = z
  .object({
    customerName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    age: z.number().int('Age must be a whole number').min(18, 'Minimum age is 18').max(120),
    propertyType: z.enum(PROPERTY_TYPES),
    propertyValue: z.number().positive('Property value must be greater than 0').max(100_000_000),
    postcode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(UK_POSTCODE, 'Must be a valid UK postcode')
      .transform(normalisePostcode),
    previousClaims: z.number().int('Claims must be a whole number').min(0).max(50),
  })
  .strict();

export type QuoteInput = z.output<typeof QuoteRequestSchema>;

/**
 * The vocabulary the KB may reference in a condition's `field`.
 * `customerName` is deliberately excluded: personal names must never drive pricing.
 */
export type ScoringInput = Omit<QuoteInput, 'customerName'>;
export type ScoringField = keyof ScoringInput;
export type FieldValue = ScoringInput[ScoringField];
export type FieldType = 'number' | 'string';

/** Field → primitive type. `satisfies` forces this map to stay in sync with the request schema. */
export const FIELD_TYPES = {
  age: 'number',
  propertyType: 'string',
  propertyValue: 'number',
  postcode: 'string',
  previousClaims: 'number',
} as const satisfies Record<ScoringField, FieldType>;

export const SCORING_FIELDS = Object.keys(FIELD_TYPES) as [ScoringField, ...ScoringField[]];
