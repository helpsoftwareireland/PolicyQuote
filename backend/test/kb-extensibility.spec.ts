import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { priceQuote } from '../src/quote/quote.service';
import { BRIEF_FACTORS, baseInput, buildKb } from './fixtures/kb.fixture';

/**
 * OBJ-2 / KB-05: "Adding, removing, or changing a risk factor must require only a KB change".
 * Every scenario below changes *only KB data* and uses the unchanged engine.
 */
describe('KB extensibility — rules are data, not code', () => {
  const exeterInput = baseInput({ postcode: 'EX1 1AA' });

  it('ADD: a flood-zone postcode factor (+15 for EX/PL) applies with a KB entry only', () => {
    const before = priceQuote(exeterInput, buildKb());
    const after = priceQuote(
      exeterInput,
      buildKb({
        version: '1.1.0',
        factors: [
          ...BRIEF_FACTORS,
          {
            id: 'flood_zone_postcode',
            description: 'Flood zone postcode area (EX, PL)',
            condition: { field: 'postcode', operator: 'starts_with', value: ['EX', 'PL'] },
            points: 15,
          },
        ],
      }),
    );

    expect(before.appliedFactors.map((f) => f.id)).not.toContain('flood_zone_postcode');
    expect(after.appliedFactors).toContainEqual({
      id: 'flood_zone_postcode',
      description: 'Flood zone postcode area (EX, PL)',
      points: 15,
      occurrences: 1,
    });
    expect(after.riskScore).toBe(before.riskScore + 15);
    expect(after.kbVersion).toBe('1.1.0');
  });

  it('CHANGE: claims penalty 15 → 20 points is a KB edit only', () => {
    const tuned = BRIEF_FACTORS.map((f) => (f.id === 'previous_claims_low' ? { ...f, points: 20 } : f));
    const quote = priceQuote(baseInput({ previousClaims: 2 }), buildKb({ factors: tuned }));
    expect(quote.riskScore).toBe(40);
  });

  it('REMOVE: deleting the Flat factor from the KB removes it from scoring', () => {
    const withoutFlat = BRIEF_FACTORS.filter((f) => f.id !== 'property_type_flat');
    const quote = priceQuote(baseInput({ propertyType: 'Flat' }), buildKb({ factors: withoutFlat }));
    expect(quote.riskScore).toBe(0);
    expect(quote.appliedFactors).toEqual([]);
  });

  it('COMPOUND: "Flat AND value > £500k → +35" via an all[] condition', () => {
    const kb = buildKb({
      factors: [
        ...BRIEF_FACTORS,
        {
          id: 'flat_high_value',
          description: 'Flat AND value over £500k',
          condition: {
            all: [
              { field: 'propertyType', operator: 'eq', value: 'Flat' },
              { field: 'propertyValue', operator: 'gt', value: 500000 },
            ],
          },
          points: 35,
        },
      ],
    });
    expect(priceQuote(baseInput({ propertyType: 'Flat', propertyValue: 600000 }), kb).riskScore).toBe(45); // 10 + 35
    expect(priceQuote(baseInput({ propertyType: 'House', propertyValue: 600000 }), kb).riskScore).toBe(0);
  });

  it('RE-BAND & RE-PRICE: thresholds, multipliers and base premium are KB data', () => {
    const kb = buildKb({
      basePremium: 400,
      coverageLoadFactor: 1,
      riskBands: {
        STANDARD: { min: 0, max: 9, riskMultiplier: 1, label: 'Standard', summary: 's' },
        HIGH_RISK: { min: 10, max: null, riskMultiplier: 3, label: 'High', summary: 'h' },
      },
    });
    const quote = priceQuote(baseInput({ propertyType: 'Flat' }), kb);
    expect(quote.riskBand).toBe('HIGH_RISK');
    expect(quote.annualPremium).toBe(1200);
  });

  describe('guardrail: no scoring values hardcoded in the engine (constraint #3)', () => {
    const engineDir = path.resolve(__dirname, '../src/engine');
    const sources = readdirSync(engineDir)
      .filter((f) => f.endsWith('.ts') && statSync(path.join(engineDir, f)).isFile())
      .map((f) => ({ file: f, code: readFileSync(path.join(engineDir, f), 'utf8') }));

    // Strip comments so documentation can mention numbers.
    const codeOnly = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    it.each(sources)('$file contains no KB literals, switch statements or factor ids', ({ code }) => {
      const body = codeOnly(code);
      expect(body).not.toMatch(/\bswitch\s*\(/);
      expect(body).not.toMatch(/\b(?:15|20|25|30|35|300|750000|500000|1\.2|1\.5|2\.2)\b/);
      expect(body).not.toMatch(/age_young_elderly|previous_claims|property_type_flat|property_value_high|'Flat'/);
    });
  });
});
