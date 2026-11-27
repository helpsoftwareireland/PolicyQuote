import type { ScoringField } from '../quote/quote.schema';

/**
 * Knowledge Base type model (BRD KB-02..04, KB-08).
 * `KnowledgeBaseSchema` in kb.schema.ts is annotated as `z.ZodType<KnowledgeBase>`, so the
 * compiler guarantees these interfaces and the runtime validator never drift apart.
 */

export type Scalar = string | number;

interface LeafBase {
  readonly field: ScoringField;
}

export interface ScalarCondition<O extends 'eq' | 'neq'> extends LeafBase {
  readonly operator: O;
  readonly value: Scalar;
}

export interface ComparisonCondition<O extends 'gt' | 'gte' | 'lt' | 'lte'> extends LeafBase {
  readonly operator: O;
  readonly value: number;
}

export interface RangeCondition<O extends 'between' | 'outside_range'> extends LeafBase {
  readonly operator: O;
  readonly min: number;
  readonly max: number;
}

export interface InCondition extends LeafBase {
  readonly operator: 'in';
  readonly values: readonly Scalar[];
}

export interface StartsWithCondition extends LeafBase {
  readonly operator: 'starts_with';
  /** One prefix or any-of list; case-insensitive. */
  readonly value: string | readonly string[];
}

export type LeafCondition =
  | ScalarCondition<'eq'>
  | ScalarCondition<'neq'>
  | ComparisonCondition<'gt'>
  | ComparisonCondition<'gte'>
  | ComparisonCondition<'lt'>
  | ComparisonCondition<'lte'>
  | RangeCondition<'between'>
  | RangeCondition<'outside_range'>
  | InCondition
  | StartsWithCondition;

export type Operator = LeafCondition['operator'];

/** Logical AND over child conditions. */
export interface AllCondition {
  readonly all: readonly Condition[];
}

/** Logical OR over child conditions. */
export interface AnyCondition {
  readonly any: readonly Condition[];
}

export type Condition = LeafCondition | AllCondition | AnyCondition;

export interface RiskFactor {
  readonly id: string;
  /** Customer-facing explanation, rendered in the UI's "risk factors applied" list. */
  readonly description: string;
  readonly condition: Condition;
  readonly points: number;
  /** When true, points are multiplied by the numeric value of the occurrence field (e.g. per claim). */
  readonly perOccurrence?: boolean;
  /** Field to count for perOccurrence; defaults to the leaf condition's own field. */
  readonly occurrenceField?: ScoringField;
}

export interface RiskBandDefinition {
  readonly min: number;
  /** `null` = open-ended top band. */
  readonly max: number | null;
  readonly riskMultiplier: number;
  readonly label: string;
  readonly summary: string;
}

export interface KnowledgeBase {
  /** Engine compatibility contract — bump only for breaking schema changes. */
  readonly schemaVersion: number;
  /** Content version of this rule set (semver) — echoed in every quote. */
  readonly version: string;
  readonly basePremium: number;
  readonly coverageLoadFactor: number;
  readonly currency: string;
  readonly riskBands: Readonly<Record<string, RiskBandDefinition>>;
  readonly factors: readonly RiskFactor[];
}
