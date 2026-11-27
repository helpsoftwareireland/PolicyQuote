import { buildRiskSummary, calculatePremium, resolveBand, scoreRisk } from '../engine/risk-engine';
import { ValidationError } from '../errors';
import type { KnowledgeBase } from '../kb/kb.types';
import { QuoteRequestSchema, type QuoteInput } from './quote.schema';
import type { QuoteResponse } from './quote.types';

/** Validate an untrusted request body, then price it (BRD FR-13). */
export function createQuote(body: unknown, kb: KnowledgeBase): QuoteResponse {
  const parsed = QuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join('.') || '(body)', message: issue.message })),
    );
  }
  return priceQuote(parsed.data, kb);
}

/** Orchestrates engine steps into the API response (BRD FR-14..19). */
export function priceQuote(input: QuoteInput, kb: KnowledgeBase): QuoteResponse {
  const { customerName: _name, ...scoringInput } = input;
  const assessment = scoreRisk(scoringInput, kb.factors);
  const band = resolveBand(assessment.score, kb.riskBands);
  const premium = calculatePremium(kb, band);

  return {
    ...premium,
    currency: kb.currency,
    riskBand: band.id,
    riskBandLabel: band.label,
    riskScore: assessment.score,
    riskSummary: buildRiskSummary(band, assessment),
    coverageDetails: {
      basePremium: kb.basePremium,
      riskMultiplier: band.riskMultiplier,
      coverageLoadFactor: kb.coverageLoadFactor,
      propertyType: input.propertyType,
      propertyValue: input.propertyValue,
      currency: kb.currency,
      formula: `${kb.basePremium} × ${band.riskMultiplier} × ${kb.coverageLoadFactor}`,
    },
    appliedFactors: assessment.appliedFactors,
    kbVersion: kb.version,
  };
}
