/**
 * API contract for POST /policy/quote — mirrors backend/src/quote/quote.types.ts (BRD FR-17..19).
 */

export const PROPERTY_TYPES = ['House', 'Flat', 'Bungalow'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * Bands are defined by the KB, so the type is open-ended; the three known ids keep autocomplete.
 * `string & {}` stops TypeScript collapsing the union to plain `string`.
 */
export type KnownRiskBand = 'STANDARD' | 'ELEVATED' | 'HIGH_RISK';
export type RiskBand = KnownRiskBand | (string & {});

export interface QuoteRequest {
  readonly customerName: string;
  readonly age: number;
  readonly propertyType: PropertyType;
  readonly propertyValue: number;
  readonly postcode: string;
  readonly previousClaims: number;
}

export interface AppliedFactor {
  readonly id: string;
  readonly description: string;
  readonly points: number;
  readonly occurrences: number;
}

export interface CoverageDetails {
  readonly basePremium: number;
  readonly riskMultiplier: number;
  readonly coverageLoadFactor: number;
  readonly propertyType: PropertyType;
  readonly propertyValue: number;
  readonly currency: string;
  readonly formula: string;
}

export interface QuoteResponse {
  readonly monthlyPremium: number;
  readonly annualPremium: number;
  readonly currency: string;
  readonly riskBand: RiskBand;
  readonly riskBandLabel: string;
  readonly riskScore: number;
  readonly riskSummary: string;
  readonly coverageDetails: CoverageDetails;
  readonly appliedFactors: readonly AppliedFactor[];
  readonly kbVersion: string;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly issues?: readonly { readonly path: string; readonly message: string }[];
  };
}
