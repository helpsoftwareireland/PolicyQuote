# Business Requirements Document — PolicyQuote

| Item | Value |
|---|---|
| Product | PolicyQuote — Policy Risk & Premium Engine |
| Document | Business Requirements Document (BRD) |
| Version | 1.0 |
| Date | 2026-11-26 |
| Author role | Business Analyst |
| Source | `Exercise_PolicyQuote 1.pdf` (Take-Away Exercise, AI Agent Edition) |
| Status | Baselined — input to Architecture (02) and Plan (03) |

---

## 1. Purpose

This document turns the PolicyQuote take-away brief into clear, numbered, testable business requirements. The Architecture document, the Implementation Plan and the QA test suite all trace back to the requirement IDs defined here.

## 2. Business context

A home insurer wants a **self-service quoting tool**. A prospective customer enters a few facts about themselves and their property and gets an **instant, explainable premium estimate**.

The key business driver is **agility of underwriting rules**. Risk analysts must be able to add, change or remove a risk factor by editing a **Knowledge Base (KB)** configuration file. Doing so must not need a developer to change the scoring code. Every rule change is then a reviewable, versioned data change instead of a software release.

A second driver is **demonstrating AI-assisted engineering**. The solution is built with an AI coding agent. A committed skill/system prompt configures the agent, and every significant interaction is logged.

## 3. Objectives & success measures

| ID | Objective | Success measure |
|---|---|---|
| OBJ-1 | Instant quote | Quote is returned in < 1 s for a valid submission on a developer machine |
| OBJ-2 | Rules owned by data, not code | Adding, changing or removing a factor needs **only** a `risk-kb.json` edit. This is proven by an automated test and a live demo |
| OBJ-3 | Explainability | Every quote lists the KB factors that contributed points, using their KB descriptions |
| OBJ-4 | Simple to run | Both services start with one `npm start` each. README gets a reviewer running in < 5 commands |
| OBJ-5 | Transparent agent usage | `AGENT_LOG.md`, `CLAUDE.md` and the project skill are committed and specific |

## 4. Scope

### 4.1 In scope
- A single-page web app (Angular) with a quote form and a result panel.
- One backend endpoint, `POST /policy/quote`, implemented as an AWS-Lambda-compatible handler.
- A KB-driven, table-driven risk scoring engine.
- KB versioning, compound AND/OR conditions, a Dockerfile with `GET /health` (bonus items).
- Unit tests (backend and frontend), README, SOLUTION.md, AGENT_LOG.md, CLAUDE.md.

### 4.2 Out of scope
- Authentication, customer accounts and persistence of quotes.
- Payment, policy binding and document generation.
- Real postcode/flood data lookups. External APIs and LLM calls are explicitly forbidden at runtime.
- Production AWS deployment (artefacts are deploy-ready but not deployed).

## 5. Stakeholders & personas

| Persona | Need |
|---|---|
| **Customer** (end user) | Enter details quickly, get a clear price and understand *why* |
| **Risk analyst / underwriter** | Maintain rating factors in the KB without raising a code change |
| **Engineer** | Clean, typed, testable code. The engine never changes for rule changes |
| **Assessment panel** | Verify requirements, KB design, Signals usage and agent workflow, and watch a live KB change |

## 6. Functional requirements

### 6.1 Quote form (frontend)

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | The form captures: **customer name**, **age**, **property type** (House / Flat / Bungalow), **property value (£)**, **postcode**, **number of previous claims in the last 5 years** | Must |
| FR-02 | The form is an Angular **Reactive Form**, with client-side validation: all fields required; age 18–120 (whole number); property value > 0; claims 0–50 (whole number); postcode in UK format; name 2–100 characters | Must |
| FR-03 | The submit button is disabled while the form is invalid or a request is in flight | Must |
| FR-04 | Inline, field-level error messages are shown once a field is touched | Should |

### 6.2 Quote result (frontend)

| ID | Requirement | Priority |
|---|---|---|
| FR-05 | Shows the **monthly premium (£)** and **annual premium (£)**, formatted as GBP currency | Must |
| FR-06 | Shows a **risk band badge**: STANDARD / ELEVATED / HIGH RISK, colour-coded | Must |
| FR-07 | Shows a **plain-English risk summary** | Must |
| FR-08 | Lists the **active risk factors applied**, using each factor's KB description and points. If no factors applied, it says so | Must |
| FR-09 | The badge is a reusable `RiskBandBadgeComponent` that takes a `riskBand` input | Must |
| FR-10 | A loading indicator is shown while the request is in flight. Errors (validation or server) are shown in an error banner | Must |
| FR-11 | Shows the KB version that priced the quote | Should (bonus) |

### 6.3 Quote API (backend)

| ID | Requirement | Priority |
|---|---|---|
| FR-12 | Exposes exactly one business endpoint: `POST /policy/quote` | Must |
| FR-13 | Validates the request body with **Zod**. Invalid input returns **HTTP 400** with field-level issues | Must |
| FR-14 | Calculates the **risk score** by evaluating every KB factor against the input and adding up points | Must |
| FR-15 | Finds the **risk band** from the score using the KB's band ranges. Each band carries its own `riskMultiplier` (STANDARD 1.0, ELEVATED 1.5, HIGH RISK 2.2) | Must |
| FR-16 | Annual premium = `basePremium × riskMultiplier × coverageLoadFactor`. Monthly = annual / 12. Both are rounded to 2 dp | Must |
| FR-17 | The response contains `{ monthlyPremium, annualPremium, riskBand, riskScore, riskSummary, coverageDetails, appliedFactors }` and also `kbVersion` | Must |
| FR-18 | `appliedFactors[]` items contain `id`, `description` (from the KB) and `points` awarded | Must |
| FR-19 | `coverageDetails` reports the inputs to the premium formula (base premium, risk multiplier, coverage load factor, property value, property type) | Must |
| FR-20 | Exports a Lambda-compatible `handler(event, context)` that accepts an API Gateway proxy event and returns a proxy result | Must |
| FR-21 | Unknown routes return 404. Wrong methods return 405. Malformed JSON returns 400. Unexpected failures return 500 without leaking internals | Must |
| FR-22 | CORS headers allow the frontend origin to call the API | Must |

### 6.4 Knowledge Base

| ID | Requirement | Priority |
|---|---|---|
| KB-01 | Scoring rules live in a structured JSON file, **`kb/risk-kb.json`**, committed at the repository root level as a first-class artefact | Must |
| KB-02 | The KB holds: `version`, `basePremium`, `coverageLoadFactor`, `riskBands` (min, max, multiplier, label, summary), `factors[]` | Must |
| KB-03 | Each factor has `id`, `description`, `condition`, `points`, and optional `perOccurrence` (points × field value, e.g. per claim) | Must |
| KB-04 | Supported operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `between`, `outside_range`, `in`, `starts_with` (case-insensitive string prefix, single value or list) | Must |
| KB-05 | **Adding** a factor needs only a new KB entry. **Changing** a weight needs only a KB edit. **Removing** a factor needs only deleting its entry. **No engine code change** in any of these cases | Must |
| KB-06 | The engine is table-driven: it iterates factors and dispatches to a generic operator registry. No `if/else` chain per factor and no `switch` per operator | Must |
| KB-07 | The KB is validated at load time against a schema. An invalid KB fails fast with a clear error and is never half-applied | Must |
| KB-08 | **Compound conditions**: a condition can be `{ "all": [...] }` (AND) or `{ "any": [...] }` (OR), nestable. Example: Flat AND value > £500k → +35 | Should (bonus) |
| KB-09 | **Versioning**: the KB `version` is returned in every quote and from `/health`. The KB path can be overridden with an environment variable, so a new rule set can be pointed to without rebuilding code | Should (bonus) |
| KB-10 | Band summaries (plain-English text) are KB content, not code | Should |

### 6.5 Operational

| ID | Requirement | Priority |
|---|---|---|
| OP-01 | `npm start` in `backend/` starts the API on port 3000 | Must |
| OP-02 | `npm start` in `frontend/` starts the Angular dev server on port 4200, proxying `/policy` to the backend | Must |
| OP-03 | Multi-stage `Dockerfile` for the backend (Fargate-ready) with `GET /health` returning status and KB version | Should (bonus) |

## 7. Business rules (seed KB content)

| Rule ID | Description | Condition | Points |
|---|---|---|---|
| `age_young_elderly` | Under 25 or over 75 — higher risk profile | age outside 25–75 | 20 |
| `previous_claims_low` | 1–2 previous claims | claims between 1 and 2 | 15 per claim |
| `previous_claims_high` | 3 or more previous claims | claims ≥ 3 | 30 per claim |
| `property_type_flat` | Flat — higher shared risk | propertyType = Flat | 10 |
| `property_value_high` | Property value over £750,000 | propertyValue > 750,000 | 25 |
| `flat_high_value` (bonus) | Flat AND property value over £500,000 | all [Flat, value > 500,000] | 35 |

| Band | Score range | riskMultiplier |
|---|---|---|
| STANDARD | 0 – 25 | 1.0 |
| ELEVATED | 26 – 60 | 1.5 |
| HIGH_RISK (shown "HIGH RISK") | 61 + | 2.2 |

Base premium £300 and coverage load factor 1.2 give these annual premiums: STANDARD £360.00, ELEVATED £540.00, HIGH RISK £792.00.

**Rule BR-1:** `perOccurrence: true` multiplies the points by the numeric value of the condition's field (e.g. 2 claims × 15 = 30).
**Rule BR-2:** If a score falls outside every band, this is a KB configuration error and the API returns 500. The KB validator rejects gaps at load time.

## 8. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Determinism | The same input and KB always give the same output. No LLM or external API calls from the backend |
| NFR-02 | Type safety | TypeScript strict mode, **no `any`**, KB schema typed with interfaces |
| NFR-03 | UI | No external UI component libraries (Material, PrimeNG, Bootstrap). Hand-written CSS. Responsive down to 360 px |
| NFR-04 | State | Angular **Signals** (`signal`, `computed`, `effect`) for all UI state. No `BehaviorSubject`/`Subject` for local state |
| NFR-05 | Architecture | Angular 17+ **standalone components only** (no NgModules) |
| NFR-06 | Testability | Jest unit tests cover all 3 risk bands (≥ 3 cases), every operator, compound conditions and KB extensibility |
| NFR-07 | Accessibility | Labelled inputs, `aria-live` result region, colour plus text in the badge (not colour alone) |
| NFR-08 | Security | Input validated at the boundary. Error responses do not leak stack traces. Request body size is capped |

## 9. Assumptions & constraints
- A-1: Currency is GBP and premiums round to 2 decimals (half-up).
- A-2: `riskMultiplier` is a property of each band in the KB. The brief shows it in a table, so we store it in the KB so that no scoring values live in code.
- A-3: Postcode validation is UK-format and syntactic only. It is normalised to uppercase.
- A-4: "Previous claims" and "age" are whole numbers.
- A-5: The KB is a local file loaded once per Lambda cold start (cached), and reloaded on `KB_PATH` change or process restart.

## 10. Deliverables (acceptance checklist)

| ID | Deliverable |
|---|---|
| D-1 | Source repo: `backend/`, `frontend/`, `kb/risk-kb.json` |
| D-2 | `README.md` — run in < 5 commands, KB location documented |
| D-3 | `AGENT_LOG.md` — prompt → output → change → why |
| D-4 | `SOLUTION.md` — ≤ 300 words |
| D-5 | `CLAUDE.md` + `.claude/skills/` — agent configuration |
| D-6 | `backend/Dockerfile` (bonus) |
| D-7 | Passing automated tests (backend Jest, frontend unit tests) and a QA test report |

## 11. Acceptance criteria (Gherkin)

```gherkin
Scenario: Standard risk quote
  Given a 40-year-old with a House worth £300,000, postcode "SW1A 1AA", 0 claims
  When they request a quote
  Then riskScore is 0, riskBand is STANDARD, annualPremium is 360.00, monthlyPremium is 30.00
  And appliedFactors is empty

Scenario: Elevated risk quote
  Given a 30-year-old with a House worth £300,000 and 2 previous claims
  When they request a quote
  Then riskScore is 30, riskBand is ELEVATED, annualPremium is 540.00
  And appliedFactors contains "previous_claims_low" with 30 points

Scenario: High risk quote
  Given a 22-year-old with a Flat worth £800,000 and 3 previous claims
  When they request a quote
  Then riskBand is HIGH_RISK and annualPremium is 792.00

Scenario: New factor via KB only
  Given the KB gains factor "flood_zone_postcode" (+15 if postcode starts with "EX" or "PL")
  And no engine source file is modified
  When a customer with postcode "EX1 1AA" requests a quote
  Then appliedFactors contains "flood_zone_postcode" with 15 points

Scenario: Invalid input
  Given the request body has age "abc"
  When it is posted to /policy/quote
  Then the response is 400 with an issue for field "age"
```

## 12. Traceability

The Architecture document (02) maps components to these IDs. The Plan (03) maps tasks to them. The Test Report (04) maps test cases to them.
