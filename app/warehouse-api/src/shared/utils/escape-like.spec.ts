import { escapeLike } from './query.util';

// Tách khỏi query.util.spec.ts để tránh xung đột với nhánh đang sửa file đó.
describe('escapeLike', () => {
  it.each([
    ['%', String.raw`\%`],
    ['_', String.raw`\_`],
    ['\\', String.raw`\\`],
    ['50%', String.raw`50\%`],
    ['A_B', String.raw`A\_B`],
    [String.raw`C:\tmp`, String.raw`C:\\tmp`],
  ])('escapes the LIKE special character in %p', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });

  it('escapes every special character of a mixed string in one pass', () => {
    expect(escapeLike(String.raw`a%_\b%%__\\`)).toBe(String.raw`a\%\_\\b\%\%\_\_\\\\`);
  });

  it.each(['Nguyễn Văn', 'MAT-001', '0900123456', 'thep ong'])(
    'leaves %p unchanged (no special character)',
    (input) => {
      expect(escapeLike(input)).toBe(input);
    },
  );

  it('returns an empty string for an empty string', () => {
    expect(escapeLike('')).toBe('');
  });

  it('does not double-escape when applied again to a plain string', () => {
    expect(escapeLike(escapeLike('Kilogram 50'))).toBe('Kilogram 50');
  });
});
