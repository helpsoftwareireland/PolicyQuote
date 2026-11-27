# SOLUTION

## Architecture
The backend is a pure `handler(event, context)`. `server.ts` (local and Fargate) is a thin `node:http` adapter over it, so Lambda and containers share one code path. Layers: handler → quote service → pure engine. The Angular frontend uses standalone components and a signal store, and the reactive form's state reaches the template only as `computed()` signals. RxJS is used only for `HttpClient`.

## KB design
- **Condition AST, interpreted.** Leaves are `{field, operator, ...}`, and `all`/`any` nest for AND/OR. A registry maps operator → function: no `switch`, no per-factor code. A new factor is data, and a new operator is one registry entry.
- **Every number in the KB.** `riskMultiplier`, band labels and summaries live in the bands. A Jest guardrail scans the engine for scoring literals.
- **Fail fast.** A Zod discriminated union per operator gives errors like `factors[2].condition.max`. Semantic checks cover contiguous bands, operator/field types and unique ids. The schema is typed `ZodType<KnowledgeBase>`, so it can't drift from the interfaces.
- **Versioning.** `version` (content, returned per quote) is separate from `schemaVersion` (engine contract). `KB_PATH` can be a channel of `risk-kb.vN.json` files, and each engine loads the newest schema it supports. A breaking schema therefore ships *alongside* the old one, with no Lambda redeploy. Invalid edits keep the last-known-good KB, flagged on `/health`.

## Agent configuration
`CLAUDE.md` holds the hard rules the agent must self-check (no scoring literals, no `any`, Signals only), a folder map and a definition of done. The `add-kb-factor` skill encodes the live-demo workflow and forbids touching `engine/`. Its tests are generated from each KB factor.

## With more time
Move the form to Signal Forms (stable in Angular 22), validating with the backend's Zod schema via Standard Schema, so the UI and API share one set of validation rules.
