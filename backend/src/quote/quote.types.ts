import type { PropertyType } from './quote.schema';

/** API response contract for POST /policy/quote (BRD FR-17..19). Mirrored in frontend/src/app/core/models. */

export interface AppliedFactor {
  readonly id: string;
  /** KB description — the customer-facing explanation. */
  readonly description: string;
  /** Points awarded (already multiplied by occurrences). */
  readonly points: number;
  /** 1 for flat factors; the field value for perOccurrence factors (e.g. number of claims). */
  readonly occurrences: number;
}

export interface CoverageDetails {
  readonly basePremium: number;
  readonly riskMultiplier: number;
  readonly coverageLoadFactor: number;
  readonly propertyType: PropertyType;
  readonly propertyValue: number;
  readonly currency: string;
  /** Human-readable premium formula with the actual numbers used. */
  readonly formula: string;
}

export interface QuoteResponse {
  readonly monthlyPremium: number;
  readonly annualPremium: number;
  readonly currency: string;
  /** Band id from the KB, e.g. STANDARD | ELEVATED | HIGH_RISK. */
  readonly riskBand: string;
  readonly riskBandLabel: string;
  readonly riskScore: number;
  readonly riskSummary: string;
  readonly coverageDetails: CoverageDetails;
  readonly appliedFactors: readonly AppliedFactor[];
  readonly kbVersion: string;
}
