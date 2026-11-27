import { isAllCondition, isAnyCondition } from '../kb/condition-guards';
import type { Condition } from '../kb/kb.types';
import type { ScoringInput } from '../quote/quote.schema';
import { applyOperator } from './operators';

/**
 * Generic, recursive interpreter for the KB condition grammar (BRD KB-06, KB-08).
 * It knows three shapes — AND, OR, leaf — and nothing about any specific factor.
 */
export function evaluateCondition(condition: Condition, input: ScoringInput): boolean {
  if (isAllCondition(condition)) return condition.all.every((child) => evaluateCondition(child, input));
  if (isAnyCondition(condition)) return condition.any.some((child) => evaluateCondition(child, input));
  return applyOperator(condition, input[condition.field]);
}
