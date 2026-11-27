import type { LeafCondition, Operator, Scalar } from '../kb/kb.types';
import type { FieldValue } from '../quote/quote.schema';

/**
 * Operator registry (BRD KB-04, KB-06) — a lookup table, not a switch.
 * Adding an operator = one entry here + one branch in kb.schema.ts. Adding a *factor* never touches this file.
 */

type ConditionFor<O extends Operator> = Extract<LeafCondition, { operator: O }>;
export type OperatorFn<O extends Operator> = (actual: FieldValue, condition: ConditionFor<O>) => boolean;
export type OperatorRegistry = { readonly [O in Operator]: OperatorFn<O> };

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const upper = (s: string): string => s.trim().toUpperCase();
/** Strings compare case-insensitively ("flat" == "Flat"); numbers compare strictly. */
const normalise = (v: Scalar): Scalar => (typeof v === 'string' ? upper(v) : v);
const toList = (v: string | readonly string[]): readonly string[] => (typeof v === 'string' ? [v] : v);

export const OPERATORS: OperatorRegistry = Object.freeze({
  eq: (actual, c) => normalise(actual) === normalise(c.value),
  neq: (actual, c) => normalise(actual) !== normalise(c.value),
  gt: (actual, c) => isNumber(actual) && actual > c.value,
  gte: (actual, c) => isNumber(actual) && actual >= c.value,
  lt: (actual, c) => isNumber(actual) && actual < c.value,
  lte: (actual, c) => isNumber(actual) && actual <= c.value,
  between: (actual, c) => isNumber(actual) && actual >= c.min && actual <= c.max,
  outside_range: (actual, c) => isNumber(actual) && (actual < c.min || actual > c.max),
  in: (actual, c) => c.values.some((v) => normalise(v) === normalise(actual)),
  starts_with: (actual, c) => typeof actual === 'string' && toList(c.value).some((p) => upper(actual).startsWith(upper(p))),
});

export function applyOperator(condition: LeafCondition, actual: FieldValue): boolean {
  // TypeScript cannot correlate `condition.operator` with the matching registry entry's parameter
  // type (microsoft/TypeScript#30581), so the looked-up function is widened once here. This is safe
  // because the registry is keyed by the same discriminant the condition carries.
  const evaluate = OPERATORS[condition.operator] as (actual: FieldValue, condition: LeafCondition) => boolean;
  return evaluate(actual, condition);
}
