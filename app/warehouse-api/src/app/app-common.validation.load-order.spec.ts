// Issue #179: import này PHẢI đứng đầu file — mô phỏng `app-common.validation` được nạp trước
// `app.validation`. Trước #179 hai file import vòng nhau ⇒ thứ tự này làm `AppValidation` thiếu mọi
// key chung (`page=0` trả 400 không `code`). Mỗi spec file có registry module riêng của Jest.
import { AppCommonValidation } from './app-common.validation';
import { AppValidation } from './app.validation';

type ValidationModule = Record<string, unknown>;

/**
 * Nạp `firstPath` trong registry module sạch rồi mới tới `app.validation` — kiểm từng file
 * `*.validation.ts` không còn vòng import qua `app.validation`.
 */
const loadAppValidationAfter = (firstPath: string) => {
  let first: ValidationModule = {};
  let app: ValidationModule = {};
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- cần require đồng bộ trong isolateModules để điều khiển thứ tự nạp
    first = require(firstPath) as ValidationModule;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- như trên
    app = require('./app.validation') as ValidationModule;
  });
  return { first, app };
};

describe('validation load order (issue #179)', () => {
  it('AppValidation has every shared key when app-common.validation is loaded first', () => {
    const keys = Object.keys(AppCommonValidation);
    expect(keys).toEqual(
      expect.arrayContaining([
        'DATA_VERSION_CONFLICT',
        'START_DATE_INVALID',
        'END_DATE_INVALID',
        'SORT_INVALID',
        'SORT_BY_INVALID',
        'PAGE_INVALID',
        'SIZE_INVALID',
      ]),
    );
    for (const key of keys) {
      expect(AppValidation[key]).toEqual(AppCommonValidation[key]);
    }
    expect(AppValidation.PAGE_INVALID).toMatchObject({ code: 100854, statusCode: 422 });
  });

  it.each([
    ['./app-common.validation', 'AppCommonValidation'],
    ['src/auth/auth.validation', 'AuthValidation'],
    ['src/import-form/import-form.validation', 'ImportFormValidation'],
    ['src/inventory/inventory.validation', 'InventoryValidation'],
    ['src/file/file.validation', 'FileValidation'],
  ])('isolated: %s loaded first ⇒ AppValidation includes its keys', (path, exportName) => {
    const { first, app } = loadAppValidationAfter(path);
    const own = first[exportName] as Record<string, unknown>;
    const merged = app.AppValidation as Record<string, unknown>;

    expect(Object.keys(own).length).toBeGreaterThan(0);
    for (const key of Object.keys(own)) {
      expect(merged[key]).toEqual(own[key]);
    }
  });
});
