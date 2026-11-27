# Demo Scenarios — PolicyQuote

| Item | Value |
|---|---|
| Purpose | Ready-made form entries for the live review: every band, every factor, the band boundaries, validation errors and live KB changes |
| KB baseline | `kb/risk-kb.json` **v1.1.0** (6 factors) |
| Expected values | Computed by running each input through the real engine and KB, not by hand |

## Before you start

1. Start both services (see [README](../README.md#run-it)), then open http://localhost:4200.
2. The fastest way to enter a scenario is to click the **Standard** preset, then change only the fields listed.
3. **Key fact for the panel: the premium depends only on the band.** The score picks a band, and the band's multiplier sets the price. There are only three prices:

| Band | Score | Multiplier | Monthly | Annual |
|---|---|---|---|---|
| STANDARD | 0–25 | 1.0 | £30.00 | £360.00 |
| ELEVATED | 26–60 | 1.5 | £45.00 | £540.00 |
| HIGH RISK | 61+ | 2.2 | £66.00 | £792.00 |

The formula is `£300 base × multiplier × 1.2 coverage load`, all three values from the KB.

## Part A: Twelve quote scenarios

### Quick reference

| # | Scenario | Name | Age | Type | Value (£) | Postcode | Claims | Score | Band | £/month | £/year |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S01 | Clean baseline | Alex Morgan | 40 | House | 300000 | SW1A 1AA | 0 | **0** | STANDARD | 30.00 | 360.00 |
| S02 | Factor applied, price unchanged | Priya Shah | 22 | House | 250000 | M1 1AE | 0 | **20** | STANDARD | 30.00 | 360.00 |
| S03 | Top edge of STANDARD | Daniel Okafor | 45 | House | 800000 | GU1 3AA | 0 | **25** | STANDARD | 30.00 | 360.00 |
| S04 | One claim, no age loading at 70 | Margaret Ellis | 70 | Bungalow | 400000 | BN1 1AA | 1 | **15** | STANDARD | 30.00 | 360.00 |
| S05 | Per-claim points | Sam Patel | 30 | House | 300000 | M1 1AE | 2 | **30** | ELEVATED | 45.00 | 540.00 |
| S06 | Two small factors combine | Tom Byrne | 22 | Flat | 180000 | LS1 4AP | 0 | **30** | ELEVATED | 45.00 | 540.00 |
| S07 | Flat under £500k (compound **not** met) | Chloe Martin | 40 | Flat | 450000 | E1 6AN | 0 | **10** | STANDARD | 30.00 | 360.00 |
| S08 | Flat over £500k (compound **met**) | James Wright | 40 | Flat | 600000 | E1 6AN | 0 | **45** | ELEVATED | 45.00 | 540.00 |
| S09 | Top edge of ELEVATED | Arthur Hughes | 78 | Flat | 300000 | CF10 1AA | 2 | **60** | ELEVATED | 45.00 | 540.00 |
| S10 | The claims cliff (2 → 3 claims) | Liam Doyle | 35 | House | 300000 | B33 8TH | 3 | **90** | HIGH RISK | 66.00 | 792.00 |
| S11 | Everything stacks (the "High risk" preset) | Jo Taylor | 22 | Flat | 800000 | EX1 1AA | 3 | **180** | HIGH RISK | 66.00 | 792.00 |
| S12 | Live-demo profile (Exeter, 1 claim) | Alex Morgan | 40 | House | 300000 | EX1 1AA | 1 | **15** | STANDARD | 30.00 | 360.00 |

### What each scenario shows

| # | Factors applied (KB id: points) | Talking point |
|---|---|---|
| S01 | none | The UI says "No risk factors applied". The score starts at 0, and the base price is purely KB values. |
| S02 | `age_young_elderly`: 20 | **A factor applied but the price didn't move.** Points accumulate, and only the band sets the price. Good for explaining score vs band. |
| S03 | `property_value_high`: 25 | **Boundary test.** 25 is the inclusive top of STANDARD, so one more point would make it ELEVATED. Also shows `gt 750000`: £800k counts, £750k exactly would not. |
| S04 | `previous_claims_low`: 15 | Age **70** is inside `outside_range 25–75`, so no age loading. Bungalow carries no type loading. Contrast with S09 (78). |
| S05 | `previous_claims_low`: 30 (15 × 2) | **`perOccurrence`.** The UI shows "× 2". The points are multiplied by the claim count from the KB rule, not from code. |
| S06 | `age_young_elderly`: 20, `property_type_flat`: 10 | Two factors that are each harmless (STANDARD on their own) combine to cross into ELEVATED. |
| S07 | `property_type_flat`: 10 | **Run S07 then S08 back to back.** Same flat, only the value changes. The compound rule stays silent below £500k. |
| S08 | `property_type_flat`: 10, `flat_high_value`: 35 | **Compound AND** (`all: [Flat, > £500k]`), the brief's bonus example. Answers "how would you combine two fields?" with the live UI. |
| S09 | `age_young_elderly`: 20, `previous_claims_low`: 30 (× 2), `property_type_flat`: 10 | **Boundary test.** Exactly 60, the top of ELEVATED. This is the best scenario for the "change a weight" live edit (K2). |
| S10 | `previous_claims_high`: 90 (30 × 3) | **One extra claim takes the score from 30 (S05) to 90.** At 3 claims the KB switches from the 15-point rule to the 30-point rule, both per claim. A good discussion of whether that cliff is intended underwriting. |
| S11 | `age_young_elderly`: 20, `previous_claims_high`: 90 (× 3), `property_type_flat`: 10, `property_value_high`: 25, `flat_high_value`: 35 | The maximum-stacking case. The price is capped at the HIGH RISK band price even at 180 points. The "How we calculated this" panel shows `300 × 2.2 × 1.2`. |
| S12 | `previous_claims_low`: 15 | The baseline for the flood-zone live change (K1). Sits 10 points below the band boundary. |

### Suggested 5-minute tour
**S01 → S02 → S05 → S07 → S08 → S10 → S11.** It goes from no risk, to "points without price change", to per-claim scoring, to the compound rule on/off, to the claims cliff, to maximum stacking.

## Part B: Validation & error scenarios

The UI validates first: the submit button stays **disabled** and inline errors appear once a field is touched. The API re-validates with Zod, so bypassing the UI gets a `400` with field-level issues.

| # | Entry | UI behaviour (inline message) | API response if bypassed (`curl`) |
|---|---|---|---|
| V1 | Age `17` | "You must be 18 or over" | 400 · `age`: "Minimum age is 18" |
| V2 | Postcode `12345` | "Please enter a valid UK postcode" | 400 · `postcode`: "Must be a valid UK postcode" |
| V3 | Property value `0` | "Value must be greater than £0" | 400 · `propertyValue`: "Property value must be greater than 0" |
| V4 | Claims `1.5` | "Must be a whole number" | 400 · `previousClaims`: "Claims must be a whole number" |
| V5 | Postcode `sw1a1aa` (lower case, no space) | Accepted | 200. The API normalises it to `SW1A 1AA` and prices it like S01 (£30/£360) |
| V6 | Stop the backend (`Ctrl+C`), then submit S01 | Red banner: "Cannot reach the quote service right now. Please try again in a moment." (dismissible). The dev proxy answers **502 Bad Gateway**, and the UI treats 0/502/503/504 as "unreachable" | n/a |

V1 via the API, for the panel:
```bash
curl -s -X POST http://localhost:3000/policy/quote -H "Content-Type: application/json" \
  -d '{"customerName":"Alex Morgan","age":17,"propertyType":"House","propertyValue":300000,"postcode":"SW1A 1AA","previousClaims":0}'
```
An unknown property type (e.g. `"Castle"`) can only be sent via the API. It returns 400 with `Invalid option: expected one of "House"|"Flat"|"Bungalow"`.

## Part C: Live KB changes (no restart, no code)

Each change edits **only** `kb/risk-kb.json`. Save the file, then re-submit the same scenario and the server hot-reloads. Use the `add-kb-factor` skill so the agent also adds a test and bumps `version`. **Revert afterwards** with `git checkout kb/risk-kb.json`.

| # | KB change | Re-submit | Before → After |
|---|---|---|---|
| K1 | **Add** flood zone: `{ "field": "postcode", "operator": "starts_with", "value": ["EX","PL"] }`, +15 | S12 | 15 STANDARD £30 → **30 ELEVATED £45** (new factor listed) |
| | | `PL4 8AA` in S01 | 0 → 15, still STANDARD (proves the "PL" branch) |
| | | S07 / S08 (`E1 6AN`) | unchanged: London "E" must **not** match "EX" |
| | | S11 | 180 → 195, still HIGH RISK £66 (already in the top band) |
| K2 | **Change weight**: `previous_claims_low` points 15 → 20 | S09 | 60 ELEVATED £45 → **70 HIGH RISK £66** |
| | | S05 | 30 → 40, still ELEVATED (score moves, price doesn't) |
| K3 | **Remove** the `property_type_flat` factor | S06 | 30 ELEVATED £45 → **20 STANDARD £30** |
| | | S08 | 45 → 35, still ELEVATED (the compound rule still fires) |
| K4 | **Re-price a band**: ELEVATED `riskMultiplier` 1.5 → 1.6 | S05 | £45 / £540 → **£48 / £576**, same score and band |
| K5 | **Add an OR rule**: `{ "any": [ {age gt 70}, {previousClaims gte 2} ] }`, +10 | S09 | 60 ELEVATED → **70 HIGH RISK** |
| | | S05 | 30 → 40, still ELEVATED |
| | | S04 (age 70, 1 claim) | unchanged: `gt 70` excludes exactly 70, and 1 claim < 2 |

Copy-paste snippets for the `factors` array:

```jsonc
// K1: flood zone (append to "factors"; bump "version" to 1.2.0)
{ "id": "flood_zone_postcode", "description": "Flood zone postcode area (EX, PL) — higher flood risk",
  "condition": { "field": "postcode", "operator": "starts_with", "value": ["EX", "PL"] }, "points": 15 }

// K5: OR rule (append to "factors"; bump "version" to 1.2.0)
{ "id": "senior_or_claims", "description": "Over 70 or 2+ previous claims",
  "condition": { "any": [ { "field": "age", "operator": "gt", "value": 70 },
                          { "field": "previousClaims", "operator": "gte", "value": 2 } ] }, "points": 10 }
```

**Resilience extra:** save the KB with a deliberate typo (e.g. delete a closing brace) and re-submit any scenario. The quote still works on the last valid KB, and the backend log shows `KB reload rejected; serving last-known-good`. Fix the file and the next quote uses it.

## Part D: Likely panel questions → scenario to show

| Question | Show |
|---|---|
| "Add a new risk factor live" | K1 on S12 (or whatever they specify, following the same flow) |
| "Combine two fields, e.g. Flat AND over £500k" | S07 vs S08: it's already in the KB as `flat_high_value` |
| "What about OR?" | K5 |
| "Change a weight without code" | K2 on S09 (crosses into HIGH RISK) |
| "Where do the prices come from?" | S11 → "How we calculated this" panel, then the `riskBands` block in the KB |
| "What if the KB is broken?" | Resilience extra above, plus `npm run kb:validate` |
| "A rule on data we don't collect (e.g. thatched roof)?" | Not a KB change: it needs a new form field and request-schema field. The skill stops and says so |
