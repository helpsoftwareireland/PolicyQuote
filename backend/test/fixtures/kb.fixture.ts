import { parseKnowledgeBase } from '../../src/kb/kb.loader';
import type { KnowledgeBase, RiskFactor } from '../../src/kb/kb.types';
import type { QuoteInput } from '../../src/quote/quote.schema';

/**
 * Test KB = the brief's example verbatim (5 factors) + band multipliers. Kept separate from the
 * real kb/risk-kb.json so engine tests don't break when analysts tune the production rules.
 */
export const BRIEF_FACTORS: readonly RiskFactor[] = [
  {
    id: 'age_young_elderly',
    description: 'Under 25 or over 75 — higher risk profile',
    condition: { field: 'age', operator: 'outside_range', min: 25, max: 75 },
    points: 20,
  },
  {
    id: 'previous_claims_low',
    description: '1–2 previous claims',
    condition: { field: 'previousClaims', operator: 'between', min: 1, max: 2 },
    points: 15,
    perOccurrence: true,
  },
  {
    id: 'previous_claims_high',
    description: '3 or more previous claims',
    condition: { field: 'previousClaims', operator: 'gte', value: 3 },
    points: 30,
    perOccurrence: true,
  },
  {
    id: 'property_type_flat',
    description: 'Flat — higher shared risk',
    condition: { field: 'propertyType', operator: 'eq', value: 'Flat' },
    points: 10,
  },
  {
    id: 'property_value_high',
    description: 'Property value over £750,000',
    condition: { field: 'propertyValue', operator: 'gt', value: 750000 },
    points: 25,
  },
];

export const BASE_KB_JSON = {
  schemaVersion: 1,
  version: '1.0.0',
  basePremium: 300,
  coverageLoadFactor: 1.2,
  currency: 'GBP',
  riskBands: {
    STANDARD: { min: 0, max: 25, riskMultiplier: 1.0, label: 'Standard', summary: 'Standard risk.' },
    ELEVATED: { min: 26, max: 60, riskMultiplier: 1.5, label: 'Elevated', summary: 'Elevated risk.' },
    HIGH_RISK: { min: 61, max: null, riskMultiplier: 2.2, label: 'High risk', summary: 'High risk.' },
  },
  factors: BRIEF_FACTORS,
};

/** Build a *validated* KB with overrides — same path production uses. */
export const buildKb = (overrides: Partial<Record<keyof KnowledgeBase, unknown>> = {}): KnowledgeBase =>
  parseKnowledgeBase(JSON.parse(JSON.stringify({ ...BASE_KB_JSON, ...overrides })));

/** Deep-cloned raw JSON for negative schema tests. */
export const rawKb = (): Record<string, unknown> => JSON.parse(JSON.stringify(BASE_KB_JSON)) as Record<string, unknown>;

/** A low-risk applicant: scores 0 against the brief's factors. */
export const baseInput = (overrides: Partial<QuoteInput> = {}): QuoteInput => ({
  customerName: 'Jane Doe',
  age: 40,
  propertyType: 'House',
  propertyValue: 300000,
  postcode: 'SW1A 1AA',
  previousClaims: 0,
  ...overrides,
});
