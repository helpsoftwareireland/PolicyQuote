import {
  FIELD_TYPES,
  PROPERTY_TYPES,
  QuoteRequestSchema,
  type FieldValue,
  type QuoteInput,
  type ScoringField,
  type ScoringInput,
} from '../quote/quote.schema';
import { isAllCondition, isAnyCondition, isLeafCondition } from './condition-guards';
import type { Condition, LeafCondition, Operator, RiskFactor } from './kb.types';

/**
 * Test-case generator driven by the Knowledge Base (review item G3).
 *
 * For every KB factor it derives boundary inputs straight from the condition data — just inside / just
 * outside each threshold, each prefix, each AND/OR branch — and the expected outcome. The expectations
 * come from the operator *definitions* (e.g. "gt 750000 → 750001 hits, 750000 misses"), not from running
 * the engine, so the generated tests are an independent oracle. A factor added to the KB is therefore
 * covered by tests with zero new test code.
 */

type Assignment = Partial<Record<ScoringField, FieldValue>>;

interface Probes {
  readonly hits: readonly FieldValue[];
  readonly misses: readonly FieldValue[];
}

type StringField = { [F in ScoringField]: (typeof FIELD_TYPES)[F] extends 'string' ? F : never }[ScoringField];

/** Realistic sample values for string fields; `satisfies` forces an entry for every string field. */
const SAMPLE_VALUES = {
  propertyType: PROPERTY_TYPES,
  postcode: ['ZZ9 9ZZ', 'SW1A 1AA', 'M1 1AE', 'B33 8TH'],
} as const satisfies Record<StringField, readonly string[]>;

const isStringField = (field: ScoringField): field is StringField => FIELD_TYPES[field] === 'string';
const upper = (v: FieldValue): FieldValue => (typeof v === 'string' ? v.toUpperCase() : v);

/** A value for `field` that differs from every excluded value (case-insensitive for strings). */
function otherValue(field: ScoringField, excluded: readonly FieldValue[]): FieldValue {
  const taken = excluded.map(upper);
  if (isStringField(field)) {
    return SAMPLE_VALUES[field].find((v) => !taken.includes(v.toUpperCase())) ?? 'ZZZ';
  }
  const numbers = excluded.filter((v): v is number => typeof v === 'number');
  return (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
}

const prefixList = (value: string | readonly string[]): readonly string[] => (typeof value === 'string' ? [value] : value);

function startingWith(field: ScoringField, prefix: string): string {
  const samples: readonly string[] = isStringField(field) ? SAMPLE_VALUES[field] : [];
  return samples.find((s) => s.toUpperCase().startsWith(prefix.toUpperCase())) ?? `${prefix.toUpperCase()}1 1AA`;
}

function notStartingWith(field: ScoringField, prefixes: readonly string[]): string {
  const samples: readonly string[] = isStringField(field) ? SAMPLE_VALUES[field] : [];
  const misses = (s: string) => !prefixes.some((p) => s.toUpperCase().startsWith(p.toUpperCase()));
  return samples.find(misses) ?? 'ZZ9 9ZZ';
}

type ProbeFn<O extends Operator> = (condition: Extract<LeafCondition, { operator: O }>) => Probes;
type ProbeRegistry = { readonly [O in Operator]: ProbeFn<O> };

/** Boundary probes per operator — mirrors the semantics documented for the OPERATORS registry. */
const PROBES: ProbeRegistry = {
  eq: (c) => ({ hits: [c.value], misses: [otherValue(c.field, [c.value])] }),
  neq: (c) => ({ hits: [otherValue(c.field, [c.value])], misses: [c.value] }),
  gt: (c) => ({ hits: [c.value + 1], misses: [c.value] }),
  gte: (c) => ({ hits: [c.value], misses: [c.value - 1] }),
  lt: (c) => ({ hits: [c.value - 1], misses: [c.value] }),
  lte: (c) => ({ hits: [c.value], misses: [c.value + 1] }),
  between: (c) => ({ hits: [c.min, c.max], misses: [c.min - 1, c.max + 1] }),
  outside_range: (c) => ({ hits: [c.min - 1, c.max + 1], misses: [c.min, c.max] }),
  in: (c) => ({ hits: [...c.values], misses: [otherValue(c.field, c.values)] }),
  starts_with: (c) => {
    const prefixes = prefixList(c.value);
    return { hits: prefixes.map((p) => startingWith(c.field, p)), misses: [notStartingWith(c.field, prefixes)] };
  },
};

function probe(leaf: LeafCondition): Probes {
  // Same correlated-union limitation as applyOperator (microsoft/TypeScript#30581): widen once, safely,
  // because PROBES is keyed by the same discriminant the leaf carries.
  const fn = PROBES[leaf.operator] as (condition: LeafCondition) => Probes;
  return fn(leaf);
}

/** Merge representative assignments; `undefined` if two of them need different values for one field. */
function merge(parts: readonly Assignment[]): Assignment | undefined {
  const merged: Assignment = {};
  for (const part of parts) {
    for (const [field, value] of Object.entries(part) as [ScoringField, FieldValue][]) {
      if (field in merged && merged[field] !== value) return undefined;
      merged[field] = value;
    }
  }
  return merged;
}

const defined = <T>(items: readonly (T | undefined)[]): T[] => items.filter((i): i is T => i !== undefined);

interface Branches {
  readonly hits: readonly Assignment[];
  readonly misses: readonly Assignment[];
}

/** Inputs that make `condition` true (hits) and false (misses), recursively through all/any. */
function branches(condition: Condition): Branches {
  if (isLeafCondition(condition)) {
    const { hits, misses } = probe(condition);
    const at = (value: FieldValue): Assignment => ({ [condition.field]: value });
    return { hits: hits.map(at), misses: misses.map(at) };
  }
  const children = (isAllCondition(condition) ? condition.all : isAnyCondition(condition) ? condition.any : []).map(branches);
  const firstHits = children.map((c) => c.hits[0]);
  const firstMisses = children.map((c) => c.misses[0]);
  const others = (reps: readonly (Assignment | undefined)[], i: number) => reps.filter((_, j) => j !== i);

  if (isAllCondition(condition)) {
    // AND: true when every child is true; false when exactly one child is false (each in turn).
    const hit = firstHits.every(Boolean) ? merge(defined(firstHits)) : undefined;
    const misses = children.map((c, i) => (c.misses[0] ? merge([...defined(others(firstHits, i)), c.misses[0]]) : undefined));
    return { hits: defined([hit]), misses: defined(misses) };
  }
  // OR: true when exactly one child is true (each in turn); false when every child is false.
  const hits = children.map((c, i) => (c.hits[0] ? merge([...defined(others(firstMisses, i)), c.hits[0]]) : undefined));
  const miss = firstMisses.every(Boolean) ? merge(defined(firstMisses)) : undefined;
  return { hits: defined(hits), misses: defined([miss]) };
}

interface CaseBase {
  readonly factorId: string;
  readonly kind: 'hit' | 'miss';
  /** e.g. "propertyValue=750001" */
  readonly label: string;
}

export interface GeneratedCase extends CaseBase {
  /** A complete request that passed the real request schema — something a customer could submit. */
  readonly input: QuoteInput;
  /** Points this factor must contribute: factor points (× occurrences) for a hit, 0 for a miss. */
  readonly expectedPoints: number;
}

/** A probe no valid request can reach (e.g. age 17). All hits unreachable ⇒ the factor can never apply. */
export interface UnreachableCase extends CaseBase {
  readonly reason: string;
}

export interface FactorCases {
  readonly cases: readonly GeneratedCase[];
  readonly unreachable: readonly UnreachableCase[];
}

const describeAssignment = (a: Assignment): string =>
  Object.entries(a)
    .map(([field, value]) => `${field}=${String(value)}`)
    .join(', ');

function occurrences(factor: RiskFactor, input: ScoringInput): number {
  if (!factor.perOccurrence) return 1;
  const field = factor.occurrenceField ?? (isLeafCondition(factor.condition) ? factor.condition.field : undefined);
  const value = field ? input[field] : undefined;
  return typeof value === 'number' ? value : 1;
}

/**
 * All generated cases for one KB factor. Fields the factor ignores come from `base`. Each probe is run
 * through `QuoteRequestSchema`, which gives a properly typed input (no casts) and separates reachable
 * cases from probes that validation would block.
 */
export function generateFactorCases(factor: RiskFactor, base: QuoteInput): FactorCases {
  const { hits, misses } = branches(factor.condition);
  const cases: GeneratedCase[] = [];
  const unreachable: UnreachableCase[] = [];

  const add = (kind: CaseBase['kind']) => (overrides: Assignment): void => {
    const label = describeAssignment(overrides);
    const parsed = QuoteRequestSchema.safeParse({ ...base, ...overrides });
    if (!parsed.success) {
      const reason = parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join('; ');
      unreachable.push({ factorId: factor.id, kind, label, reason });
      return;
    }
    const expectedPoints = kind === 'hit' ? factor.points * occurrences(factor, parsed.data) : 0;
    cases.push({ factorId: factor.id, kind, label, input: parsed.data, expectedPoints });
  };

  hits.forEach(add('hit'));
  misses.forEach(add('miss'));
  return { cases, unreachable };
}
