import {
  buildObjectKey,
  OBJECT_KEY_EXTENSION_MAX_LENGTH,
  OBJECT_KEY_FALLBACK_NAME,
  OBJECT_KEY_NAME_MAX_LENGTH,
} from './s3-key.util';

const SUFFIX = 'sfx';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('buildObjectKey', () => {
  it.each([
    ['invoice.exe.pdf', 'invoice-exe-sfx.pdf'],
    ['README', 'readme-sfx'],
    ['Report.PDF', 'report-sfx.pdf'],
    ['  my   big  file .pdf', 'my-big-file-sfx.pdf'],
    ['../../x.pdf', 'x-sfx.pdf'],
    ['/etc/passwd', 'passwd-sfx'],
    ['a\\b.pdf', 'b-sfx.pdf'],
    ['C:\\Users\\me\\..\\Hoá đơn.xlsx', 'hoa-don-sfx.xlsx'],
    ['Hoá đơn tháng 1 (bản cuối).pdf', 'hoa-don-thang-1-ban-cuoi-sfx.pdf'],
    ['ĐƠN HÀNG.docx', 'don-hang-sfx.docx'],
    ['@#$%^&*().pdf', `${OBJECT_KEY_FALLBACK_NAME}-sfx.pdf`],
    ['!!!', `${OBJECT_KEY_FALLBACK_NAME}-sfx`],
    ['', `${OBJECT_KEY_FALLBACK_NAME}-sfx`],
    ['.pdf', 'pdf-sfx'],
    ['file.', 'file-sfx'],
    ['snake_case--name.png', 'snake_case-name-sfx.png'],
    ['--_trim_--.jpg', 'trim-sfx.jpg'],
    ['photo.jp g', 'photo-sfx.jpg'],
    ['photo.???', 'photo-sfx'],
  ])('%j → %j', (originalname, expected) => {
    expect(buildObjectKey(originalname, undefined, SUFFIX)).toBe(expected);
  });

  it('keeps the folder as prefix when given and omits it otherwise', () => {
    expect(buildObjectKey('a.pdf', 'import-forms', SUFFIX)).toBe('import-forms/a-sfx.pdf');
    expect(buildObjectKey('a.pdf', '', SUFFIX)).toBe('a-sfx.pdf');
    expect(buildObjectKey('a.pdf', undefined, SUFFIX)).toBe('a-sfx.pdf');
  });

  it('caps a very long name and a very long extension', () => {
    const key = buildObjectKey(`${'a'.repeat(500)}.${'x'.repeat(50)}`, undefined, SUFFIX);

    expect(key).toBe(
      `${'a'.repeat(OBJECT_KEY_NAME_MAX_LENGTH)}-sfx.${'x'.repeat(OBJECT_KEY_EXTENSION_MAX_LENGTH)}`,
    );
  });

  it('does not leave a trailing dash when the cut lands on a separator', () => {
    const name = `${'a'.repeat(OBJECT_KEY_NAME_MAX_LENGTH - 1)} b`;

    expect(buildObjectKey(`${name}.pdf`, undefined, SUFFIX)).toBe(
      `${'a'.repeat(OBJECT_KEY_NAME_MAX_LENGTH - 1)}-sfx.pdf`,
    );
  });

  it('only produces safe characters', () => {
    const key = buildObjectKey('../ <img src=x onerror=alert(1)>?.HTML', 'export-forms', SUFFIX);

    expect(key).toBe('export-forms/img-src-x-onerror-alert-1-sfx.html');
    expect(key).toMatch(/^export-forms\/[a-z0-9_-]+\.[a-z0-9]+$/);
  });

  it('uses a random UUID suffix by default so the same name gives different keys', () => {
    const first = buildObjectKey('invoice.pdf');
    const second = buildObjectKey('invoice.pdf');

    expect(first).not.toBe(second);
    for (const key of [first, second]) {
      const match = /^invoice-(.+)\.pdf$/.exec(key);
      expect(match?.[1]).toMatch(UUID_PATTERN);
    }
  });
});
