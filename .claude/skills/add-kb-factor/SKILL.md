---
name: add-kb-factor
description: Add, change or remove a risk factor in the PolicyQuote Knowledge Base (kb/risk-kb.json) without touching engine code. Use when asked to add a new risk rule, change points/weights, or remove a factor.
---

# Add / change / remove a KB risk factor

The whole point of this project is that **risk rules are data**. Follow these steps exactly.

## 1. Translate the request into a KB condition
Pick the operator from the supported set (see `backend/src/kb/kb.schema.ts`):

| Need | Operator | Params |
|---|---|---|
| exact match | `eq` / `neq` | `value` |
| numeric compare | `gt` `gte` `lt` `lte` | `value` (number) |
| inclusive range | `between` | `min`, `max` |
| outside range | `outside_range` | `min`, `max` |
| one of a list | `in` | `values: []` |
| prefix (e.g. postcode area) | `starts_with` | `value: "EX"` or `["EX","PL"]` (case-insensitive) |
| combine conditions | `{ "all": [...] }` (AND) / `{ "any": [...] }` (OR) | nestable |

Fields available: `age`, `propertyType`, `propertyValue`, `postcode`, `previousClaims`.
If the rule needs a field or operator that is **not** listed, stop and tell the user: that is a code change (schema + form), not a KB change.

## 2. Edit only `kb/risk-kb.json`
- Append a factor with a unique snake_case `id`, a customer-readable `description` (it is shown in the UI), `points` (integer) and `condition`.
- Use `perOccurrence: true` only for countable numeric fields (points × value).
- Bump `version`: new or removed factor → minor, weight change → patch.
- **Do not edit anything under `backend/src/`.** If you think you need to, explain why first.

## 3. Prove it
1. `cd backend && npm run kb:validate` must print `KB valid`.
2. `cd backend && npm run kb:cases` prints the boundary cases **generated from the KB** for the new factor (hits just inside, misses just outside). They run automatically in `npm test` (`kb-generated-cases.spec.ts`), so no hand-written test is needed for coverage. If it warns "no valid request can trigger", the condition is unreachable (e.g. `age lt 18`): stop and tell the user.
3. Optional, for the demo: add a scenario test to `backend/test/kb-live.spec.ts` showing a business outcome (e.g. the factor moving a customer up a band).
4. `cd backend && npm test` must be green.
5. If the servers are running, no restart is needed: the KB hot-reloads. Re-submit the quote in the UI. If the UI shows "rule-set edit was rejected", the KB is invalid: run `kb:validate`.

## 4. Report
- Show `git diff --stat` (expect only `kb/risk-kb.json` and the test file).
- Append an `AGENT_LOG.md` entry.
