import type { AllCondition, AnyCondition, Condition, LeafCondition } from './kb.types';

/** Type guards for the recursive condition grammar: Leaf | { all } | { any }. */
export const isAllCondition = (c: Condition): c is AllCondition => 'all' in c;
export const isAnyCondition = (c: Condition): c is AnyCondition => 'any' in c;
export const isLeafCondition = (c: Condition): c is LeafCondition => 'operator' in c;

export type ConditionPath = (string | number)[];

/** Depth-first visit of every leaf, with its JSON path (used for precise KB validation errors). */
export function forEachLeaf(
  condition: Condition,
  path: ConditionPath,
  visit: (leaf: LeafCondition, path: ConditionPath) => void,
): void {
  if (isAllCondition(condition)) {
    condition.all.forEach((child, i) => forEachLeaf(child, [...path, 'all', i], visit));
  } else if (isAnyCondition(condition)) {
    condition.any.forEach((child, i) => forEachLeaf(child, [...path, 'any', i], visit));
  } else {
    visit(condition, path);
  }
}
