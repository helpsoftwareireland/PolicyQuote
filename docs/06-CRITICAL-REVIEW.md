# Critical Review — PolicyQuote vs the Brief and the BRD

| Item | Value |
|---|---|
| Document | Critical review of the finished app against the assessment PDF and [01-BRD.md](01-BRD.md) |
| Date | 2026-11-27 |
| Reviewed revision | `67b0a42` (Angular 22.3, TypeScript 6.0.3, KB 1.1.0) |
| Method | (1) An **independent reviewer agent** with no access to the author's conclusions read the full PDF, the BRD and all source, and ran both test suites. (2) The author checked Angular 22 APIs in the installed packages (`@angular/forms@22.3.0`, `@angular/core`, `@angular/common`). (3) Every reviewer claim used here was spot-checked against the code. One was partly rejected (see §5). (4) Responsiveness was measured in Chrome at 360 px. |
| Resolution | See §6. Each issue was fixed in its own commit and logged in AGENT_LOG |

## 1. Verdict

Every hard requirement in the brief is implemented and passes the automated suite (143 backend + 42 frontend tests). The code-level checks hold up under independent review: no `any`, no `switch`, no `BehaviorSubject`, no UI libraries, KB-only extensibility. **The gaps are in what the panel scores beyond "it works"**: the agent-workflow evidence, one bonus answered the wrong way, and form state that doesn't use Signals as fully as Angular 22 now allows.

## 2. Does the app use Signals?

**Yes, but not everywhere it could.**

| Area | Signals? | How |
|---|---|---|
| `loading`, `quoteResult`, `errorMessage` | ✅ | Private `signal()`s exposed read-only (the three the brief names) |
| Derived view state | ✅ | `computed()` in the store, result and badge components |
| Side effects | ✅ | `effect()` for the tab title, `afterRenderEffect()` for focus |
| Component API | ✅ | `input()`, `input.required()`, `output()`, `viewChild()` |
| **Form state** | ⚠️ partly | Reactive Forms. Only the overall status is bridged (`toSignal(statusChanges)`). Field errors and touched state come from an `errorFor()` **method called 10× in the template**, not from signals |
| HTTP | RxJS | Required by the brief ("RxJS HttpClient"), and correct for a POST |
| Dead signals | ❌ | `hasResult`, `appliedFactors` and `totalFactorPoints` in `QuoteStore` are used only by tests. The result component recomputes a "Total" that always equals `riskScore` |

## 3. Signal Forms on Angular 22

Verified in `@angular/forms@22.3.0`: **Signal Forms is stable.** `form()` is tagged `@publicApi 22.0`, where in v21 it was experimental. The form directive is `[formField]`.

**Advantages for this app**
1. **All form state becomes signals.** Each field exposes `value()`, `touched()`, `errors()`, `valid()` and `submitting()`. That removes the `toSignal` bridge and the `errorFor()` method, and takes RxJS out of the form entirely.
2. **One validation source for frontend and backend.** Signal Forms includes `validateStandardSchema`, and **Zod 4 implements Standard Schema**. The form could validate with the same `QuoteRequestSchema` the API uses. Today the rules are duplicated and already diverge in wording: UI "You must be 18 or over" vs API "Minimum age is 18".
3. Model-first and fully typed: the form model is a `signal<QuoteRequest>()`.

**Risks**
- **The brief literally says "Reactive form".** Signal Forms is a different API, so a literal reading could count it as non-compliance.
- Cost: rewrite the form component, its template and 13 tests. The Zod schema has to move somewhere both projects can import, which adds Zod to the frontend bundle.

**Decision:** keep Reactive Forms for literal compliance, but make form state **signal-driven**: derive each field's error and touched state as `computed()` from `toSignal(form.events)`. Signal Forms plus a shared Zod schema is the documented next step and a talking point.

**Other Angular 22 facts**
- **OnPush is now the default** ("NOTE: OnPush is enabled by default" in `ChangeDetectionStrategy`), and zoneless has been the default since v21. The explicit `OnPush` and zoneless declarations are kept on purpose for readability. They are redundant, not wrong.
- **`httpResource` is stable (`@publicApi 22.0`)**, but it is designed for reactive *reads*. Using HttpClient for a submit-triggered POST is the correct choice, and the brief requires it.

## 4. Gaps against the brief, ranked by likely point impact

| # | Issue | Criterion (points) | Fix |
|---|---|---|---|
| G1 | **AGENT_LOG is thin on real prompts.** Entries 2–6 have no individual prompt. The build came from one role-staged prompt, and the rubric penalises vague "generate this app" prompting. Everything sits in one 77-file commit. | Agent workflow (20) | Make the fixes as small, explicit prompts, each logged and committed. **The candidate must add their own rejections.** Do not backfill prompts that never happened. |
| G2 | **Bonus not met: "breaking KB schema changes without redeploying the Lambda".** The documented answer (deploy an engine supporting N and N+1) *is* a redeploy. S3/AppConfig loading is docs-only, and the docs mention a "cache TTL" that doesn't exist. | KB design (25) | Publish the KB in every supported schema version (`risk-kb.v1.json`, `v2`, …) and have the loader pick the newest version it supports. Rewrite Architecture §5.7 and SOLUTION. |
| G3 | **"Use the agent to generate code from the Knowledge Base"**: no evidence. The BRD dropped this requirement. | Agent workflow (20) | Agent-written generator that derives boundary test cases from each KB factor's condition, independent of the engine. |
| G4 | **A KB typo fails silently during the live demo.** The server keeps the last-known-good KB, and `/health` still reports OK. | Live demo (10) | Report rejected reloads on `/health`: `kbStatus`, `lastReloadError`. |
| G5 | **"Under 5 commands" fails if `cd` counts.** It's 6, but the README claims 4. | Deliverable | Root `package.json`: `npm install` + `npm start` starts both services. |
| G6 | Form state not signal-driven. Dead `computed`s, a duplicated total, and two band→tone mappings (badge `TONES` vs result `bandTone`). | Signals (20), quality (10) | §3 decision. Delete the dead state, use `riskScore` for the total, keep one tone mapping. |
| G7 | `toHttpRequest` runs outside `try`, so a malformed event becomes an unhandled rejection. `CurrencyPipe` is injected as a provider. Repeated `(err as Error)` casts. | Quality (10) | Move it into `try`, use `formatCurrency`, add an `errorMessage()` helper. |
| G8 | **The validator rejects the brief's own KB example** (top band `"max": 999`), and `.strict()` refuses any extra metadata. | KB design (25) | Accept a finite top `max` (the top band is still treated as open-ended). Allow an optional `notes` field. Keep `.strict()` for typo protection. |
| G9 | No Lambda packaging story. The default KB path is outside `dist`, and mtime hot reload does nothing on Lambda's read-only bundle. | Handler (15) | Document the Lambda bundle (dist + KB + `KB_PATH`). |

## 5. BRD corrections needed

- **KB-09 recast the bonus** from "breaking schema changes without redeploy" into "KB path is overridable". That is how G2 happened.
- **"Generate code from the KB" is missing** from the BRD.
- **KB-07 ("fails fast, never half-applied") conflicts** with hot reload / last-known-good. **A-5 is factually wrong**: the code reloads on file mtime change, not "on `KB_PATH` change".
- **FR-02 validation limits** (age 18–120 etc.) are assumptions, not the brief's, and should be labelled as such.
- **KB deviations** (multiplier inside bands, open-ended top band) belong in the BRD, not only in the Architecture doc.

**Reviewer claim partly rejected:** the reviewer said the badge should be "driven by the KB band label". The brief only requires the *active risk factors* to be "driven by the KB labels". The badge wording (STANDARD / ELEVATED / HIGH RISK) is the brief's own. The duplicated tone mapping (G6) is valid.

## 6. Verified as fine

- Response shape, formula, band thresholds and multipliers match the PDF exactly.
- The engine is table-driven, and KB-only extensibility is proven by tests.
- Docker bonus, compound AND/OR bonus, and KB version in every response.
- SOLUTION.md is ≤ 300 words.
- **Responsive at 360 px:** measured in Chrome with a HIGH RISK quote rendered. Single column, scroll width 345 px, no overflowing elements.

## 7. Resolution

Each fix is a separate commit with its own AGENT_LOG entry (17–25). The full regression is in [04-TEST-REPORT.md §9a](04-TEST-REPORT.md).

| # | Status | What was done | Commit |
|---|---|---|---|
| G1 | ✅ | Fixes made as small, separately committed and logged steps (entries 17–26). The candidate reviewed and approved all agent output, and their own decisions are recorded in AGENT_LOG entry 27. No prompts were backfilled | `f70bc3c`…latest |
| G2 | ✅ | KB channel (`risk-kb.v{N}.json`, newest supported schema wins), with a simulated rollout test. Architecture §5.7 and SOLUTION rewritten | `9d75eb7` |
| G3 | ✅ | `kb-case-generator.ts` + `npm run kb:cases`: boundary tests generated from every KB factor, with unreachable-probe detection | `5a9dc09` |
| G4 | ✅ | `/health` `kbStatus` + `lastReloadError`, `X-KB-Status` header, UI notice. Verified in Chrome | `5d4e39c` |
| G5 | ✅ | Root `npm install` + `npm start` (2 commands). Also fixed the `PORT` collision with `ng serve` | `eee8e3b` |
| G6 | ✅ | Signal-driven form state (`computed` from per-control `events`), dead store state removed, single tone mapping, total = `riskScore` | `d1ce56b` |
| G7 | ✅ | Event parsing inside `try`, `errorMessage()` helper, `formatCurrency` instead of an injected pipe | `f50098e`, `d1ce56b` |
| G8 | ✅ | Finite top-band `max` accepted (highest band always open-ended). Optional `notes`. `.strict()` kept | `8eeba9f` |
| G9 | ✅ | Lambda bundle and `KB_PATH` documented (README, Architecture §9) | `08d2058` |
| BRD | ✅ | v1.1: KB-07, KB-09, A-5 corrected. FR-02 limits moved to A-6. AG-01..04 added. KB deviations recorded in §7. D-1 and D-4 completed | final docs commit |

**Deliberately not done:** migrating to Signal Forms (see §3; documented as the next step in SOLUTION), and a Lambda zip script (G9: documentation was the proportionate fix).
