import { normalisePostcode, QuoteRequestSchema } from '../src/quote/quote.schema';
import { baseInput } from './fixtures/kb.fixture';

describe('QuoteRequestSchema (FR-02, FR-13)', () => {
  const parse = (overrides: Record<string, unknown>) => QuoteRequestSchema.safeParse({ ...baseInput(), ...overrides });

  it('accepts a valid request', () => {
    expect(parse({}).success).toBe(true);
  });

  it.each([
    ['sw1a1aa', 'SW1A 1AA'],
    ['  ex1 1aa ', 'EX1 1AA'],
    ['M1 1AE', 'M1 1AE'],
    ['B338TH', 'B33 8TH'],
    ['GIR 0AA', 'GIR 0AA'],
  ])('normalises postcode %p → %p', (input, expected) => {
    const result = parse({ postcode: input });
    expect(result.success && result.data.postcode).toBe(expected);
  });

  it('normalisePostcode inserts a single space before the inward code', () => {
    expect(normalisePostcode('pl48aa')).toBe('PL4 8AA');
  });

  it.each<[string, Record<string, unknown>]>([
    ['age', { age: 17 }],
    ['age', { age: 121 }],
    ['age', { age: 30.5 }],
    ['age', { age: '30' }],
    ['propertyType', { propertyType: 'Castle' }],
    ['propertyValue', { propertyValue: 0 }],
    ['propertyValue', { propertyValue: -1 }],
    ['postcode', { postcode: '12345' }],
    ['postcode', { postcode: 'NOT A POSTCODE' }],
    ['previousClaims', { previousClaims: -1 }],
    ['previousClaims', { previousClaims: 1.5 }],
    ['customerName', { customerName: ' ' }],
  ])('rejects invalid %s (%o)', (field, overrides) => {
    const result = parse(overrides);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(field);
  });

  it('rejects unknown keys (strict) so typos are not silently ignored', () => {
    expect(parse({ previousClaim: 1 }).success).toBe(false);
  });

  it('rejects missing fields', () => {
    const { age: _age, ...withoutAge } = baseInput();
    expect(QuoteRequestSchema.safeParse(withoutAge).success).toBe(false);
  });
});
