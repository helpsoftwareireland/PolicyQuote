import { z } from 'zod';
import { FIELD_TYPES, SCORING_FIELDS, type FieldType } from '../quote/quote.schema';
import { forEachLeaf, isLeafCondition } from './condition-guards';
import type { Condition, KnowledgeBase, LeafCondition, Operator, Scalar } from './kb.types';

/**
 * Runtime validator for kb/risk-kb.json (BRD KB-07).
 * Structural rules come from Zod; cross-field rules (bands, ids, operator/field types) from `checkSemantics`.
 */

/** Engine ⇄ KB contract. A KB with any other schemaVersion is refused (Architecture §5.7). */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1];

/** Which input type each operator may target. `any` = string or number. */
export const OPERATOR_FIELD_TYPES: Readonly<Record<Operator, FieldType | 'any'>> = {
  eq: 'any',
  neq: 'any',
  in: 'any',
  gt: 'number',
  gte: 'number',
  lt: 'number',
  lte: 'number',
  between: 'number',
  outside_range: 'number',
  starts_with: 'string',
};

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const FieldSchema = z.enum(SCORING_FIELDS);
const ScalarSchema = z.union([z.string().min(1), z.number()]);

const scalarLeaf = <const O extends 'eq' | 'neq'>(operator: O) =>
  z.object({ field: FieldSchema, operator: z.literal(operator), value: ScalarSchema }).strict();

const comparisonLeaf = <const O extends 'gt' | 'gte' | 'lt' | 'lte'>(operator: O) =>
  z.object({ field: FieldSchema, operator: z.literal(operator), value: z.number() }).strict();

const rangeLeaf = <const O extends 'between' | 'outside_range'>(operator: O) =>
  z.object({ field: FieldSchema, operator: z.literal(operator), min: z.number(), max: z.number() }).strict();

/** One schema branch per operator → precise errors such as `factors[2].condition.max: expected number`. */
const LeafConditionSchema = z.discriminatedUnion('operator', [
  scalarLeaf('eq'),
  scalarLeaf('neq'),
  comparisonLeaf('gt'),
  comparisonLeaf('gte'),
  comparisonLeaf('lt'),
  comparisonLeaf('lte'),
  rangeLeaf('between'),
  rangeLeaf('outside_range'),
  z.object({ field: FieldSchema, operator: z.literal('in'), values: z.array(ScalarSchema).min(1) }).strict(),
  z
    .object({
      field: FieldSchema,
      operator: z.literal('starts_with'),
      value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    })
    .strict(),
]);

/** Recursive grammar: Leaf | { all: Condition[] } (AND) | { any: Condition[] } (OR). */
export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    LeafConditionSchema,
    z.object({ all: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ any: z.array(ConditionSchema).min(1) }).strict(),
  ]),
);

const RiskBandSchema = z
  .object({
    min: z.number().int().min(0),
    max: z.number().int().nullable(),
    riskMultiplier: z.number().positive(),
    label: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

const RiskFactorSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Factor id must be snake_case'),
    description: z.string().min(1),
    condition: ConditionSchema,
    points: z.number().int().min(0),
    perOccurrence: z.boolean().optional(),
    occurrenceField: FieldSchema.optional(),
  })
  .strict();

const KnowledgeBaseObjectSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    version: z.string().regex(SEMVER, 'version must be semver, e.g. 1.2.0'),
    basePremium: z.number().positive(),
    coverageLoadFactor: z.number().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be an ISO 4217 code'),
    riskBands: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Band ids must be UPPER_SNAKE_CASE'), RiskBandSchema),
    factors: z.array(RiskFactorSchema),
  })
  .strict();

type KbDraft = z.output<typeof KnowledgeBaseObjectSchema>;
type IssuePath = (string | number)[];
type Report = (path: IssuePath, message: string) => void;

function checkBands(kb: KbDraft, report: Report): void {
  const bands = Object.entries(kb.riskBands).sort(([, a], [, b]) => a.min - b.min);
  if (bands.length === 0) {
    report(['riskBands'], 'At least one risk band is required');
    return;
  }
  bands.forEach(([id, band], i) => {
    if (band.max !== null && band.max < band.min) {
      report(['riskBands', id], `Band ${id} has max < min`);
    }
    const previous = bands[i - 1];
    if (!previous) {
      if (band.min !== 0) report(['riskBands', id, 'min'], 'The lowest band must start at 0');
      return;
    }
    const [prevId, prevBand] = previous;
    if (prevBand.max === null) {
      report(['riskBands', prevId, 'max'], `Band ${prevId} is open-ended but is not the highest band`);
    } else if (band.min !== prevBand.max + 1) {
      report(['riskBands', id, 'min'], `Bands ${prevId} and ${id} must be contiguous (expected min ${prevBand.max + 1})`);
    }
  });
  const [lastId, lastBand] = bands[bands.length - 1] ?? [];
  if (lastId && lastBand && lastBand.max !== null) {
    report(['riskBands', lastId, 'max'], 'The highest band must be open-ended (max: null) so every score maps to a band');
  }
}

const scalarMatchesField = (value: Scalar, fieldType: FieldType): boolean => typeof value === fieldType;

function checkLeaf(leaf: LeafCondition, path: IssuePath, report: Report): void {
  const fieldType = FIELD_TYPES[leaf.field];
  const required = OPERATOR_FIELD_TYPES[leaf.operator];
  if (required !== 'any' && required !== fieldType) {
    report([...path, 'operator'], `Operator "${leaf.operator}" needs a ${required} field, but "${leaf.field}" is a ${fieldType}`);
  }
  if ('min' in leaf && leaf.min > leaf.max) {
    report([...path, 'min'], 'min must be <= max');
  }
  // A string compared against a numeric field (or vice versa) could never match — almost certainly a typo.
  if ((leaf.operator === 'eq' || leaf.operator === 'neq') && !scalarMatchesField(leaf.value, fieldType)) {
    report([...path, 'value'], `value must be a ${fieldType} to match field "${leaf.field}"`);
  }
  if (leaf.operator === 'in' && !leaf.values.every((v) => scalarMatchesField(v, fieldType))) {
    report([...path, 'values'], `values must all be ${fieldType}s to match field "${leaf.field}"`);
  }
}

function checkFactors(kb: KbDraft, report: Report): void {
  const seen = new Set<string>();
  kb.factors.forEach((factor, i) => {
    const base: IssuePath = ['factors', i];
    if (seen.has(factor.id)) report([...base, 'id'], `Duplicate factor id "${factor.id}"`);
    seen.add(factor.id);

    forEachLeaf(factor.condition, [...base, 'condition'], (leaf, path) => checkLeaf(leaf, path, report));

    if (factor.perOccurrence) {
      const field = factor.occurrenceField ?? (isLeafCondition(factor.condition) ? factor.condition.field : undefined);
      if (!field) {
        report([...base, 'occurrenceField'], 'perOccurrence on a compound condition requires "occurrenceField"');
      } else if (FIELD_TYPES[field] !== 'number') {
        report([...base, 'perOccurrence'], `perOccurrence needs a numeric field, but "${field}" is a ${FIELD_TYPES[field]}`);
      }
    }
  });
}

function checkSemantics(kb: KbDraft, ctx: z.RefinementCtx): void {
  const report: Report = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(kb.schemaVersion)) {
    report(['schemaVersion'], `Unsupported schemaVersion ${kb.schemaVersion}; this engine supports ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`);
  }
  checkBands(kb, report);
  checkFactors(kb, report);
}

/** Typed against the `KnowledgeBase` interfaces — schema/interface drift is a compile error. */
export const KnowledgeBaseSchema: z.ZodType<KnowledgeBase> = KnowledgeBaseObjectSchema.superRefine(checkSemantics);

// ---------------------------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------------------------

export interface KbIssue {
  readonly path: string;
  readonly message: string;
}

type ZodIssue = z.core.$ZodIssue;

const formatPath = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((acc, key) => (typeof key === 'number' ? `${acc}[${key}]` : acc ? `${acc}.${String(key)}` : String(key)), '');

const deepestPath = (issues: readonly ZodIssue[]): number => Math.max(0, ...issues.map((i) => i.path.length));

/**
 * A recursive union reports every branch's failure. Surface the branch that got furthest:
 * fewest issues first, then deepest path — e.g. "factors[2].condition.max" rather than "Invalid input".
 */
function mostSpecificBranch(branches: readonly (readonly ZodIssue[])[]): readonly ZodIssue[] {
  return [...branches].sort((a, b) => a.length - b.length || deepestPath(b) - deepestPath(a))[0] ?? [];
}

export function flattenKbIssues(issues: readonly ZodIssue[], base: readonly PropertyKey[] = []): KbIssue[] {
  return issues.flatMap((issue) => {
    const path = [...base, ...issue.path];
    if (issue.code === 'invalid_union' && issue.errors.length > 0) {
      return flattenKbIssues(mostSpecificBranch(issue.errors), path);
    }
    return [{ path: formatPath(path), message: issue.message }];
  });
}
