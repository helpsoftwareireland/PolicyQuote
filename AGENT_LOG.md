# AGENT_LOG

Agent: **Claude Code** (Claude Opus 5.5) in VS Code. Project instructions: [`CLAUDE.md`](CLAUDE.md). Skill: [`.claude/skills/add-kb-factor`](.claude/skills/add-kb-factor/SKILL.md).

Format per entry: **Prompt → Output → What changed / was rejected → Why**.

> Entries 1–10 are from the initial build session (2026-11-26/27). Add entries for later sessions and for the live demo below them.

---

### 1. Role-staged brief → BRD
**Prompt:** "In this folder there is a PDF … You are a Business Analyst and you have to create a Business Requirements Document… Next you are a Senior Software Architect … Architecture document… Next you are a Software Engineer … Plan document… Next you are a QA engineer and you have to make sure all the tests are running correctly."
**Output:** The agent read the 8-page PDF and produced `docs/01-BRD.md`: numbered FR / KB / NFR / OP requirements, seed business rules, Gherkin acceptance criteria and a traceability section.
**Changed:** The agent made assumptions explicit instead of silent (A-1..A-5), e.g. GBP rounding and whole-number ages. It added BR-2 (a score outside all bands is a KB error).
**Why:** Staging the work by role forces requirements to exist *before* design. Every later artefact and test cites these IDs.

### 2. Architecture
**Prompt:** (same session, Architect stage)
**Output:** `docs/02-ARCHITECTURE.md`: layering, sequence diagrams, KB schema v1, operator table, API contract, signals table, ADRs.
**Rejected / deviated from the brief's example KB:**
- `riskMultiplier` hardcoded in a TS map (the brief only shows it in a table) → **moved into each KB band**. Otherwise "no hardcoded scoring values" is violated.
- Top band `"max": 999` → **`null` (open-ended)**. With 50 claims × 30 points a score above 999 is reachable and would hit a band gap at runtime.
- A `switch(operator)` evaluator was considered → **rejected for an operator registry object**. The brief explicitly asks for "not a switch statement", and a registry is open for extension.
- A JSON-Logic library was considered → **rejected**. It is an extra dependency, untyped, and harder to explain line by line in the live demo.
**Why:** Each deviation protects the core requirement: rules are data and the engine is total.

### 3. Plan
**Prompt:** (Engineer stage)
**Output:** `docs/03-PLAN.md`: phased WBS (KB → engine → handler → UI → QA), each task traced to BRD IDs, definition of done, risks, a live-demo runbook.
**Changed:** Build order was set to inside-out so the riskiest requirement (KB-driven engine) is proven by tests before any UI exists.

### 4. Agent configuration (`CLAUDE.md` + skill)
**Output:** `CLAUDE.md` with a folder map, 8 hard rules phrased as *self-rejection checks*, commands and a definition of done. The `add-kb-factor` skill: operator cheat-sheet, "edit only `kb/risk-kb.json`", validate → test → report.
**Why:** The rules are written so the agent can check its own diff ("if you are about to type `15` in `backend/src`, stop"). The skill narrows the live-demo task to a KB-only change, so the agent can't "helpfully" add engine code.

### 5. KB + typed schema
**Output:** `kb/risk-kb.json` (brief's factors + compound `flat_high_value`), `kb.types.ts` interfaces, a Zod schema typed `z.ZodType<KnowledgeBase>`, semantic checks.
**Changed:** Error reporting for the recursive `Leaf | all | any` union. Zod's default message for a bad nested leaf is just "Invalid input". The agent added `flattenKbIssues`, which picks the most specific union branch (fewest issues, deepest path). Errors now read `factors[0].condition.all[0].value`.
**Why:** An analyst editing JSON needs a pointer to the exact line, not a generic failure.

### 6. Engine typing without `any`
**Output:** `OperatorRegistry` as a mapped type over the operator union.
**Changed / accepted:** TypeScript can't correlate `OPERATORS[c.operator]` with `c` (microsoft/TypeScript#30581). The agent used **one documented widening cast** in `applyOperator` rather than `any` or a switch. `CLAUDE.md` rule 4 whitelists exactly that location.

### 7. Tooling decision: Angular scaffold
**Prompt/Action:** The agent tried `npx --yes @angular/cli@latest` to scaffold. **This was blocked by the permission classifier** (it downloads and executes a package).
**Changed:** The project was scaffolded by hand (`angular.json`, tsconfigs, `package.json` pinned to Angular **21.2 LTS**). TypeScript is pinned to **5.9**, not the npm `latest` 7.x, because `@angular/build@21` peers on `typescript >=5.9 <6.0`.
**Why:** Pinned, reviewable config, and nothing gets executed from an unpinned download.

### 8. Frontend effect timing (self-correction)
**Output (first draft):** The focus-the-result side effect used `effect()`.
**Rejected:** Component `effect()`s run before the view is refreshed, so `#result-title` may not exist yet. → **Changed to `afterRenderEffect()`**, verified by `quote-page.component.spec.ts`.

### 9. QA: test failure triaged as a *test* bug
**Output:** 37/38 frontend tests passed. The form spec expected radio DOM `value` to be `House/Flat/Bungalow` but got `"on"`.
**Changed:** **The spec, not the component.** Angular's `RadioControlValueAccessor` treats `[value]` as a directive input. The spec now checks labels and the click → form-control binding.
**Why:** The component behaved correctly in the browser. Changing the template to satisfy a wrong assumption would have been the wrong fix.

### 10. QA: smoke test found a real defect (DEF-1)
**Output:** The curl smoke test showed a 20 KB body got an empty reply (`curl: (52)`) instead of 413.
**Changed:** In `server.ts`, `req.destroy()` was replaced with stop-buffering plus `req.resume()`, and the reply is 413 with `Connection: close`. Re-tested: `HTTP 413`.
**Why:** Unit tests can't see this. The `node:http` adapter is excluded from coverage by design, which is why the smoke script exists.

### 11. Live-demo rehearsal
**Action:** With the server running, the agent appended `flood_zone_postcode` (+15, `starts_with ["EX","PL"]`) to the KB via a script, quoted `EX1 1AA`, broke the KB on purpose, then restored it.
**Result:** `score 0 → 15` without a restart. A broken KB kept serving v1.2.0 (last-known-good). Engine diff: none. See `docs/04-TEST-REPORT.md` §5.

### 12. Docker verification (correction of an earlier claim)
**Prompt:** "run the docker build command in the README."
**Output:** `docker build -f backend/Dockerfile -t policyquote-api .` succeeded first time (249 MB). The container served `/health` and a HIGH_RISK quote (£792), ran as `node`, and the HEALTHCHECK reported `healthy`.
**Changed:** The test report had said "Docker not available". **That was wrong.** The agent's first environment probe chained `docker --version` with an `npx` download, the permission classifier blocked the whole command, and the agent wrongly concluded Docker was missing. Report and summary corrected.
**Why it matters:** This is a good example of why agent claims about the environment need verification. A blocked command is not evidence that a tool is absent.

### 13. Upgrade to Angular 22 + TypeScript 6
**Prompt:** "Can you check to upgrade this version of Angular to the latest one with also Typescript"
**Output:** The agent checked peer ranges first. Angular 22.3.0 requires `typescript >=6.0 <6.1`, so the target is TS **6.0.3**, not npm `latest` 7.0.2. It backed up the package files, then ran `ng update @angular/core@22 @angular/cli@22`, which installed TS 6.0.3 and ran migrations.
**Changed / rejected:**
- **Rejected two migration shims as unnecessary:** `withXhr()` added to two specs (no effect, `provideHttpClientTesting` replaces the backend), and suppression of the new `nullishCoalescingNotNullable` / `optionalChainNotNullable` diagnostics. Both were removed. Tests and build stay clean, so the code runs under Angular 22's stricter defaults.
- **Backend on TS 6:** `moduleResolution: "node"` now errors (TS5107). Fixed properly with `node16` rather than `ignoreDeprecations`, since TS 7 removes node10. Emitted JS is still CommonJS.
- `ts-jest` then warned that Node16 modules need `isolatedModules: true`. The agent set it, which means Jest now transpiles without type-checking, so `npm test` was changed to run `tsc --noEmit` first. The safety net is kept.
**Why:** Upgrading to the newest version that the ecosystem *supports* beats the newest that exists. Migration shims that only preserve old behaviour shouldn't stay in a codebase without a reason.

### 14. Git setup, first commit and GitHub repo
**Prompt:** "set up git and make the first commit, create a git repo called PolicyQuote"
**Output:** `git init -b main`, staged files reviewed (no `node_modules`, build output or secrets), first commit `bebfbda` (77 files). The agent then created the public repo `helpsoftwareireland/PolicyQuote` through the GitHub web UI and pushed `main`.
**Changed / decided:**
- **The assessment PDF was left out** (added to `.gitignore`). It is the hiring company's document, and the brief asks for a public repo.
- **Added `.gitattributes` (`* text=auto eol=lf`).** The global `core.autocrlf` printed CRLF warnings on every file. LF in the repo keeps Windows, Linux CI and the Docker build consistent.
- **Visibility:** the agent asked rather than assumed, because "public" publishes the code immediately. The user chose Public.
- **`gh` was not installed**, so the repo was created in Chrome. Chrome showed GitHub's login page with saved credentials autofilled. **The agent did not sign in**, stopped, and handed authentication back to the user. It resumed once the user had signed in.
- **Repo description had dropped characters** ("isk engine", missing comma) from simulated typing. The agent spotted it in the page title and corrected it with a direct form fill.
**Why:** Publishing and authentication are the user's decisions. The agent's job was to make them explicit, not to make them silently.

### 15. Live-demo rehearsal with the `add-kb-factor` skill
**Prompt:** "rehearse the live demo with the add-kb-factor skill"
**Output:** The skill ran end to end for the brief's example, flood zone postcode prefix (+15 if the postcode starts with EX or PL):
1. **Translate:** field `postcode`, operator `starts_with`, `["EX","PL"]`. It is supported, so this is a KB-only change.
2. **Edit:** appended `flood_zone_postcode` to `kb/risk-kb.json` and bumped `version` 1.1.0 → 1.2.0.
3. **Prove:** `kb:validate` OK (7 factors). In the **running** app, with no restart, the same quote (40, House £300k, 1 claim, EX1 1AA) went from **STANDARD £30/£360 (score 15)** to **ELEVATED £45/£540 (score 30)**. The new factor was listed from its KB description and the footer showed "rule set v1.2.0". Two tests added to `kb-live.spec.ts`. 145/145 green.
4. **Report:** `git diff --stat` showed only `kb/risk-kb.json` and `backend/test/kb-live.spec.ts`. `backend/src` and `frontend/src` were untouched.
**Changed / decided:**
- The rehearsal ran on a local branch, `rehearsal/flood-zone` (not pushed), and `main` was restored to KB 1.1.0. Merging it would pre-empt the panel's live request if they pick the brief's own example.
- The agent chose a demo profile that **crosses a band boundary** (15 → 30) rather than one that only changes the score, so the effect shows in the price and badge, not just in a number.
- The agent added a negative test for **`E1 6AN`**: a London "E" postcode must not match the "EX" prefix. It's the obvious edge case a reviewer will probe with `starts_with`.
**Why:** Rehearsing on a branch proves the skill and the KB-only claim without spending the real demo.

### 16. Demo scenarios document → found and fixed DEF-3
**Prompts:** "generate a document Scenarios … a dozen of different possible Form entries", then "fix the bug, then commit and push everything"
**Output:** `docs/05-DEMO-SCENARIOS.md`: 12 form entries, 6 validation/error cases, 5 live-KB-change cases, and panel questions mapped to scenarios. All expected values were computed by a script that runs each input through the compiled engine and real KB, so none are hand-calculated.
**Rejected (the agent's own draft):** V6 originally claimed that stopping the backend shows "Cannot reach the quote service". That was **written from reading the code, not observed**, so the agent tested it with a second dev server proxying to a dead port. The real response was `502 Bad Gateway` (text/plain), which fell through to the generic error. The doc was corrected first, then the bug was raised with the user rather than fixed unasked.
**Fix:** `toUserMessage` treats 0/502/503/504 as "unreachable". The API never returns those itself, so they always mean a proxy or gateway couldn't reach it. +4 tests (502/503/504 plus a non-JSON 418 fallback). Verified in Chrome against a real proxy 502. 42/42 frontend tests, clean type-check and build.
**Why:** The same gap would exist in production behind CloudFront/API Gateway. Also a reminder: a scenario document is only as good as the scenarios actually executed.

### 17. Critical review against the brief and the BRD
**Prompt:** "You are a Critical Reviewer … compare with the BRD and the original assessment … is there any advantages of using Signal Form when we are now on angular 22. Is the app use Signals?", then "save the review to docs and fix the issues".
**Output:** `docs/06-CRITICAL-REVIEW.md`, with 9 gaps (G1–G9) plus BRD corrections, ranked by rubric impact.
**How:** The agent had written all the code, so it **spawned an independent reviewer subagent** and gave it the PDF and the code, not the author's conclusions, to avoid an anchored review. Meanwhile it checked the Angular 22 API status in the installed packages rather than from memory: Signal Forms stable (`@publicApi 22.0`), OnPush now the default, `httpResource` stable. It also measured the layout at 360 px in Chrome.
**Rejected:** One reviewer claim, partly: that the badge must show the KB band *label*. The brief only requires the *factors* to be KB-label driven, and the badge wording is the brief's own. The duplicated tone mapping it found was valid and kept.
**Decided (the user gave no preference):** keep Reactive Forms but make them signal-driven, rather than Signal Forms (the brief literally says "Reactive form"). Keep the KB schema strict, but accept the brief's own example.

### 18. G7 (backend): handler robustness and error typing
**Prompt:** "save the review to docs and fix the issues" (review item G7).
**Output:** `toHttpRequest(event)` moved inside the handler's `try`. Added an `errorMessage(err: unknown)` helper, which replaced five `(err as Error).message` casts. New test: a non-HTTP event (e.g. EventBridge) now returns a 500 instead of an unhandled rejection. 144/144.
**Why:** A Lambda can be invoked by any trigger, and a cast on `unknown` is a type lie the "no `any`" spirit also rules out.

### 19. G4: a rejected KB edit is never silent
**Prompt:** "fix the issues" (review item G4: a typo in the KB during the live demo would look like "the factor doesn't work").
**Output:**
- The loader records `lastReloadError` (time, file, message, field issues) and exposes `getKnowledgeBaseStatus()`.
- `/health` returns `kbStatus: "current" | "stale"` plus the error.
- Quotes priced with a last-known-good KB carry `X-KB-Status: stale`, exposed via CORS.
- The UI shows a notice: "The latest rule-set edit was rejected … this quote used the last valid rules (vX)". It's driven by a new `kbStale` signal.
- +3 backend tests (146) and +2 frontend tests (44).
**Decided:** `/health` stays **200** while stale. The service is still pricing correctly, and a failing health check would make ECS restart the task, losing the in-memory last-known-good KB and then failing to boot on the broken file.
**Agent mistake, caught:** the first attempt rewrote the loader's tail with a shell one-liner built from nested heredocs. It **silently truncated `kb.loader.ts`**. The agent read the file back, saw the truncation, restored it with a proper edit and reviewed the full `git diff` before running tests. Lesson applied: use the edit tool for multi-line code changes, never shell string surgery.

### 20. G8: accept the brief's own KB example; allow analyst notes
**Prompt:** "fix the issues" (review item G8: the validator rejected the brief's `"max": 999`).
**Output:**
- The highest band may have a finite `max`. `resolveBand` treats the highest band as open-ended whatever its max says, so scores like 1,500 (50 claims) still map to HIGH_RISK, and `kb:validate` shows "999 (open-ended)".
- Optional `notes` on factors and bands for analyst rationale.
- `.strict()` is kept: a typo like `descripton` is still rejected (tested).
- The gap test was rewritten to use a real gap between two bands. +2 tests (148).
**Rejected alternative:** making `label`/`summary`/`schemaVersion` optional so the brief's example validates verbatim. The brief's example has no multipliers at all (they're in a table), so it can never price unmodified. Customer-facing summary text (FR-07) should stay mandatory.

### 21. G2: breaking KB schema changes without redeploying the Lambda
**Prompt:** "fix the issues" (review item G2: the documented answer, "deploy an engine supporting N and N+1", *is* a redeploy).
**Output:** `KB_PATH` may now be a **KB channel directory** of `risk-kb.v{N}.json` files. `selectKbFile` loads the newest schema version this engine supports. A file whose name disagrees with its `schemaVersion` is rejected, and an emptied channel falls back to the last-known-good KB (flagged stale). +5 tests, including a **simulated rollout**: publishing a v2 file next to v1 leaves a running v1 engine pricing, with v1 patches still hot-reloading. 153/153. Architecture §5.7 and SOLUTION were rewritten, and the non-existent "cache TTL" was removed.
**Honest scope:** the selection logic is implemented and tested. The S3/AppConfig → `/tmp`/EFS transport is described, not built.
**Why:** It decouples KB publication from engine deployment. That's the actual intent of "without redeploying the Lambda": a breaking KB change never forces a lock-step deploy.

### 22. G3: code generated from the Knowledge Base (boundary test cases)
**Prompt:** "fix the issues" (review item G3: the brief asks to "use the agent to generate code from the Knowledge Base — not just for boilerplate", and there was no evidence of it).
**Output:**
- `src/kb/kb-case-generator.ts` reads each KB factor's condition and derives boundary cases: just inside / just outside each threshold, one hit per prefix, and for AND "all true" plus "each child false", for OR the reverse. A probe registry mirrors the operator registry (no switch).
- Expected points come from the operator *definitions*, not from running the engine, so it's an independent oracle.
- `kb-generated-cases.spec.ts` runs them for every factor in the real KB (17 cases today). `npm run kb:cases` prints them.
- Shown on a KB-only flood factor: 3 cases appeared with zero test code.
- The skill now uses this instead of hand-written tests. 183/183.
**Rejected (the agent's own first draft):** the first version merged probe values straight into a typed input. `tsc` rejected it (`string | number` isn't assignable to `age: number`). Instead of a cast, every generated input now goes through the real `QuoteRequestSchema`. That gave proper types *and* a new KB check: probes no valid request can reach (e.g. `age lt 18` → age 17) are reported as unreachable, and a factor that can never fire is flagged. That also exposed a validator gap: `eq propertyType "Castle"` passes `kb:validate`, but the generator flags it.
**Why:** This is the KB-driven generation the brief asks for, and it removes the one manual step from the live demo.

### 23. G6 + G7 (frontend): signal-driven form state; remove duplication
**Prompt:** "fix the issues" (G6: form errors came from an `errorFor()` method called 10× in the template, plus dead store `computed`s and two band→tone mappings; G7: `CurrencyPipe` injected as a provider).
**Output:**
- **Form:** every control's `events` stream feeds one signal (`toSignal`). `fieldErrors` and `canSubmit` are `computed()`, and the template reads only signals.
- **Store:** removed `hasResult`, `appliedFactors` and `totalFactorPoints`, which only tests used.
- **Result:** "Total" now shows `riskScore` instead of recomputing it.
- **Tone:** one `riskBandTone()` mapping shared by the badge and the result.
- **Page:** the tab title uses `formatCurrency` + `LOCALE_ID` instead of injecting a pipe.
- 44/44, build and type-check clean.
**Caught by reading the framework source, not by assuming:** a `FormGroup` emits `touched` only the *first* time any child is touched (`markAsTouched` → `if (changed …)`). Bridging only `form.events` would miss tabbing past a second empty field. The agent merged per-control streams and wrote a regression test, then **proved the test bites**: with group-only events it fails ("1 failed | 43 passed"), with the fix it passes.
**Decided:** Reactive Forms kept (the brief says "Reactive form"). Signal Forms (stable in v22) is documented as the next step in docs/06.

### 24. G5: both services in 2 commands
**Prompt:** "fix the issues" (G5: the README claimed 4 commands, but it was 6 counting `cd`).
**Output:** A root `package.json`: `npm install` installs both projects (postinstall), and `npm start` runs `scripts/start-all.mjs`. That starts the API and UI with `[api]`/`[web]`-prefixed output, kills the whole process tree on Ctrl+C, and **stops both and exits 1 if either fails**. No new dependencies, and the per-project lockfiles and Dockerfile are untouched. Each service still starts with its own `npm start`, as the brief requires. README rewritten.
**Found by running it, not by reading it:** the first run (API on `PORT=3005`) showed `ng serve` **also honours `PORT`**, so both services bound 3005. That's a latent trap for anyone following the README's `PORT` setting. Fix: the UI gets an environment without `PORT` and an explicit `--port 4200`, and the README now warns about it. The run also printed Node's DEP0190 warning (args array with `shell: true`), fixed by passing one constant command string.
**Verified:** API on 3005 and UI on 4200 both answer. The ports are free after stopping. With 3000 already taken, the API fails with `EADDRINUSE`, the UI is stopped too, and the exit code is 1.

### 25. G9: Lambda packaging documented
**Prompt:** "fix the issues" (G9: no Lambda packaging story; the default KB path is outside a bundle; mtime hot reload is inert on Lambda's read-only filesystem).
**Output:** Architecture §9 and the README now specify the bundle contents, the handler (`dist/handler.handler`), `KB_PATH=/var/task/kb/risk-kb.json`, and why a bundled KB needs a redeploy while a KB channel on EFS or `/tmp` doesn't.
**Rejected:** a `package:lambda` script. Zipping needs either a platform-specific tool (`zip` / `Compress-Archive`) or a new dependency, for a deliverable the brief doesn't ask to deploy. Documentation is the proportionate fix; the Docker image is the verified deployable.

### 26. BRD corrections, final regression, push
**Prompt:** "save the review to docs and fix the issues" (closing items).
**Output:**
- BRD v1.1: KB-07 now reconciles fail-fast at boot with last-known-good at runtime. KB-09 restores the brief's real bonus wording. A-5 corrected. FR-02 limits labelled as assumptions (A-6). Agent-workflow requirements AG-01..04 added, which the first BRD dropped. The KB deviations from the brief's example are recorded.
- Test report §9a and the review's resolution table added. SOLUTION refreshed to 295 words: the next step is now Signal Forms with a shared Zod schema.
- Final regression: 183 + 44 tests, coverage, build, static checks, `kb:cases`, root `npm start`, Docker image, and the stale-KB notice verified in Chrome against a deliberately broken KB *copy* (the repo KB was never touched).
**Left for the candidate (G1):** add your own entries: what *you* rejected or changed in the agent's output and why. The panel will ask, and only you can answer it truthfully.

### 27. Candidate review and decisions (human in the loop)
**Prompt:** "All was approved so AGENT_LOG should have everything then push"
**Candidate's verdict:** all agent output in entries 1–26 was reviewed and **approved without further changes**.

**Decisions the candidate made during the session** (as recorded in the conversation, in order):

| # | Decision | Effect |
|---|---|---|
| 1 | Chose a role-staged workflow: BA → Architect → Engineer → QA | Requirements, then design, then plan, then tests, each building on the last (entries 1–3) |
| 2 | Asked for the Docker build to be actually run, not just written | Exposed the agent's false "Docker not available" claim (entry 12) |
| 3 | Asked for the start commands to be documented | README "Run it" rewritten |
| 4 | Asked to upgrade to the latest Angular with TypeScript | Accepted the agent's peer-range finding: Angular 22.3 + TS **6.0.3**, not TS 7 (entry 13) |
| 5 | Named the repo `PolicyQuote` and chose **Public** visibility when asked | Matches the brief's "public GitHub repository" deliverable (entry 14) |
| 6 | Signed in to GitHub personally when the agent handed authentication back | Credentials stayed with the candidate (entry 14) |
| 7 | Asked for a live-demo rehearsal with the project skill | Rehearsal kept on a local branch so the real demo isn't pre-empted (entry 15) |
| 8 | Asked for a demo-scenarios document, then for the bug it exposed to be fixed | DEF-3 fixed and verified in Chrome (entry 16) |
| 9 | Asked for an independent critical review, including whether Signal Forms is worth adopting on Angular 22 | docs/06 (entry 17) |
| 10 | Approved the agent's recommendations on the review's open choices: keep **Reactive Forms** but make them signal-driven; keep the **KB schema strict** but accept the brief's example | Entries 20 and 23 |
| 11 | Approved all fixes G2–G9 and the BRD corrections, and authorised pushing to the public repo | This push |

**Note for the review session:** most rejections in this log are the agent's self-corrections (entries 2, 8, 9, 12, 19, 22, 23, 24), each surfaced to the candidate. The candidate's own steering is the table above.

---

<!-- Template for new entries
### N. <title>
**Prompt:**
**Output:**
**Changed / rejected:**
**Why:**
-->
