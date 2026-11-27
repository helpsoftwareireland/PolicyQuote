import { KnowledgeBaseError } from '../errors';
import { isLeafCondition } from '../kb/condition-guards';
import type { KnowledgeBase, RiskBandDefinition, RiskFactor } from '../kb/kb.types';
import type { ScoringInput } from '../quote/quote.schema';
import type { AppliedFactor } from '../quote/quote.types';
import { evaluateCondition } from './condition-evaluator';

/**
 * Pure risk engine (BRD FR-14..16). Every number it uses comes from the KB argument.
 */

export interface RiskAssessment {
  readonly score: number;
  readonly appliedFactors: readonly AppliedFactor[];
}

export interface ResolvedBand extends RiskBandDefinition {
  readonly id: string;
}

export interface Premium {
  readonly annualPremium: number;
  readonly monthlyPremium: number;
}

/** Round half-up to pennies; EPSILON guards against IEEE-754 artefacts such as 539.99999999. */
export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function countOccurrences(factor: RiskFactor, input: ScoringInput): number {
  if (!factor.perOccurrence) return 1;
  const field = factor.occurrenceField ?? (isLeafCondition(factor.condition) ? factor.condition.field : undefined);
  const value = field ? input[field] : undefined;
  if (typeof value !== 'number') {
    // Unreachable with a validated KB (kb.schema checks this) — fail loudly rather than guess.
    throw new KnowledgeBaseError(`Factor "${factor.id}" is perOccurrence but has no numeric occurrence field`);
  }
  return value;
}

/** Fold over the KB factors: evaluate each condition, accumulate points, keep an audit trail. */
export function scoreRisk(input: ScoringInput, factors: readonly RiskFactor[]): RiskAssessment {
  const appliedFactors = factors
    .filter((factor) => evaluateCondition(factor.condition, input))
    .map((factor): AppliedFactor => {
      const occurrences = countOccurrences(factor, input);
      return { id: factor.id, description: factor.description, points: factor.points * occurrences, occurrences };
    });
  const score = appliedFactors.reduce((total, factor) => total + factor.points, 0);
  return { score, appliedFactors };
}

export function resolveBand(score: number, bands: KnowledgeBase['riskBands']): ResolvedBand {
  const match = Object.entries(bands).find(([, band]) => score >= band.min && (band.max === null || score <= band.max));
  if (!match) {
    // BRD BR-2: a gap in the bands is a KB configuration error (the validator should have caught it).
    throw new KnowledgeBaseError(`No risk band covers score ${score}`);
  }
  const [id, band] = match;
  return { id, ...band };
}

/** annual = basePremium × riskMultiplier × coverageLoadFactor; monthly = annual / 12. */
export function calculatePremium(kb: Pick<KnowledgeBase, 'basePremium' | 'coverageLoadFactor'>, band: RiskBandDefinition): Premium {
  const annualPremium = round2(kb.basePremium * band.riskMultiplier * kb.coverageLoadFactor);
  return { annualPremium, monthlyPremium: round2(annualPremium / 12) };
}

/** Plain-English summary: KB band text + the score and the KB descriptions of what drove it. */
export function buildRiskSummary(band: ResolvedBand, assessment: RiskAssessment): string {
  const { score, appliedFactors } = assessment;
  if (appliedFactors.length === 0) {
    return `${band.summary} Your risk score is ${score}; no risk factors were applied.`;
  }
  const noun = appliedFactors.length === 1 ? 'factor' : 'factors';
  const reasons = appliedFactors.map((f) => `${f.description} (+${f.points})`).join('; ');
  return `${band.summary} Your risk score is ${score} from ${appliedFactors.length} ${noun}: ${reasons}.`;
}
