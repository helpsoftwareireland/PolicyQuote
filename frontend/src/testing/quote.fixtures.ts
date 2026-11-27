import type { QuoteRequest, QuoteResponse } from '../app/core/models/quote.models';

export const REQUEST: QuoteRequest = {
  customerName: 'Sam Patel',
  age: 30,
  propertyType: 'House',
  propertyValue: 300000,
  postcode: 'M1 1AE',
  previousClaims: 2,
};

/** Shape returned by the real backend for REQUEST (ELEVATED band). */
export const ELEVATED_QUOTE: QuoteResponse = {
  monthlyPremium: 45,
  annualPremium: 540,
  currency: 'GBP',
  riskBand: 'ELEVATED',
  riskBandLabel: 'Elevated',
  riskScore: 30,
  riskSummary: 'Elevated risk: some factors increase the likelihood of a claim. Your risk score is 30 from 1 factor: 1–2 previous claims (+30).',
  coverageDetails: {
    basePremium: 300,
    riskMultiplier: 1.5,
    coverageLoadFactor: 1.2,
    propertyType: 'House',
    propertyValue: 300000,
    currency: 'GBP',
    formula: '300 × 1.5 × 1.2',
  },
  appliedFactors: [{ id: 'previous_claims_low', description: '1–2 previous claims', points: 30, occurrences: 2 }],
  kbVersion: '1.1.0',
};

export const STANDARD_QUOTE: QuoteResponse = {
  ...ELEVATED_QUOTE,
  monthlyPremium: 30,
  annualPremium: 360,
  riskBand: 'STANDARD',
  riskBandLabel: 'Standard',
  riskScore: 0,
  riskSummary: 'Standard risk. Your risk score is 0; no risk factors were applied.',
  coverageDetails: { ...ELEVATED_QUOTE.coverageDetails, riskMultiplier: 1 },
  appliedFactors: [],
};

export const HIGH_RISK_QUOTE: QuoteResponse = {
  ...ELEVATED_QUOTE,
  monthlyPremium: 66,
  annualPremium: 792,
  riskBand: 'HIGH_RISK',
  riskBandLabel: 'High risk',
  riskScore: 180,
  coverageDetails: { ...ELEVATED_QUOTE.coverageDetails, riskMultiplier: 2.2, propertyType: 'Flat', propertyValue: 800000 },
  appliedFactors: [
    { id: 'age_young_elderly', description: 'Under 25 or over 75 — higher risk profile', points: 20, occurrences: 1 },
    { id: 'previous_claims_high', description: '3 or more previous claims', points: 90, occurrences: 3 },
    { id: 'property_type_flat', description: 'Flat — higher shared risk', points: 10, occurrences: 1 },
    { id: 'property_value_high', description: 'Property value over £750,000', points: 25, occurrences: 1 },
    { id: 'flat_high_value', description: 'Flat with property value over £500,000 — high-value shared building', points: 35, occurrences: 1 },
  ],
};
