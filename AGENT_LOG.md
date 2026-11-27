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

---

<!-- Template for new entries
### N. <title>
**Prompt:**
**Output:**
**Changed / rejected:**
**Why:**
-->
