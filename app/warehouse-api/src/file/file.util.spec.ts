import { Request } from 'express';
import { IMPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES } from 'src/import-form/import-form.constants';
import { FILE_UPLOAD_ALLOWED_TYPES } from './file.constant';
import { FileException } from './file.exception';
import { FileValidation } from './file.validation';
import { isAllowedUploadType, uploadFileFilter } from './file.util';

const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** 9 loại người dùng chốt 2026-11-05: [đuôi, mimetype hợp lệ]. */
const ALLOWED: ReadonlyArray<[string, string]> = [
  ['pdf', PDF],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['xls', 'application/vnd.ms-excel'],
  ['xlsx', XLSX],
  ['doc', 'application/msword'],
  ['docx', DOCX],
];

const runFilter = (originalname: string, mimetype: string) => {
  const callback = jest.fn();
  uploadFileFilter({} as Request, { originalname, mimetype } as Express.Multer.File, callback);
  return callback;
};

const expectAccepted = (callback: jest.Mock) => {
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith(null, true);
};

const expectRejected = (callback: jest.Mock) => {
  expect(callback).toHaveBeenCalledTimes(1);
  const [error] = callback.mock.calls[0];
  expect(error).toBeInstanceOf(FileException);
  expect(error.code).toBe(FileValidation.FILE_TYPE_NOT_ALLOWED.code);
  expect(error.getStatus()).toBe(422);
};

describe('uploadFileFilter', () => {
  it('allows exactly the 9 agreed extensions', () => {
    expect([...FILE_UPLOAD_ALLOWED_TYPES.keys()].sort()).toEqual(
      ALLOWED.map(([extension]) => extension).sort(),
    );
  });

  // Danh sách mimetype của route phiếu nhập/xuất suy ra từ allowlist này — khoá để không ai tách lại
  // thành 2 nguồn lệch nhau (cùng 1 file qua route này nhưng bị route kia chặn).
  it('allows the same mimetypes as the import/export form upload routes', () => {
    const mimeTypes = new Set([...FILE_UPLOAD_ALLOWED_TYPES.values()].flat());
    expect([...mimeTypes].sort()).toEqual([...IMPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES].sort());
  });

  it.each(ALLOWED)('accepts .%s (%s)', (extension, mimetype) => {
    expectAccepted(runFilter(`attachment.${extension}`, mimetype));
  });

  it.each(ALLOWED)('rejects .%s with a spoofed mimetype', (extension) => {
    expectRejected(runFilter(`evil.${extension}`, 'text/html'));
  });

  it.each(ALLOWED)('rejects mimetype of .%s on a disallowed extension', (_extension, mimetype) => {
    expectRejected(runFilter('evil.html', mimetype));
  });

  it('matches extension and mimetype case-insensitively', () => {
    expectAccepted(runFilter('SCAN.PDF', 'Application/PDF'));
  });

  it('accepts a dotted base name, judging only the last extension', () => {
    expectAccepted(runFilter('report.v2.pdf', PDF));
  });

  it.each([
    ['page.html', 'text/html'],
    ['script.js', 'application/javascript'],
    ['image.svg', 'image/svg+xml'],
    ['image.gif', 'image/gif'],
    ['macro.xlsm', 'application/vnd.ms-excel.sheet.macroenabled.12'],
    ['macro.docm', 'application/vnd.ms-word.document.macroenabled.12'],
    ['archive.zip', 'application/zip'],
  ])('rejects a type outside the allowlist: %s (%s)', (originalname, mimetype) => {
    expectRejected(runFilter(originalname, mimetype));
  });

  it.each([
    ['allowed extension, spoofed mimetype', 'evil.pdf', 'text/html'],
    ['allowed mimetype, disallowed extension', 'evil.html', PDF],
    ['allowed mimetype of another allowed extension', 'photo.png', 'image/jpeg'],
    ['xlsx mimetype on .xls', 'legacy.xls', XLSX],
    ['doc mimetype on .docx', 'letter.docx', 'application/msword'],
    ['double extension ending in a disallowed one', 'invoice.pdf.exe', PDF],
  ])('rejects %s', (_label, originalname, mimetype) => {
    expectRejected(runFilter(originalname, mimetype));
  });

  it.each([
    ['no extension', 'README'],
    ['trailing dot', 'file.'],
    ['dotfile only', '.pdf'],
  ])('rejects a name with %s', (_label, originalname) => {
    expectRejected(runFilter(originalname, PDF));
  });

  // Tra bằng đuôi client gửi: object literal sẽ trúng thuộc tính prototype (TypeError ⇒ 500).
  it.each(['x.constructor', 'x.__proto__', 'x.tostring', 'x.hasownproperty'])(
    'rejects prototype-like extension %s without throwing',
    (originalname) => {
      expectRejected(runFilter(originalname, PDF));
    },
  );
});

describe('isAllowedUploadType', () => {
  it.each(ALLOWED)('accepts a matching .%s / %s pair', (extension, mimetype) => {
    expect(isAllowedUploadType(`hoa-don.${extension}`, mimetype)).toBe(true);
  });

  it.each([
    ['x.html', 'application/pdf', 'disallowed extension declared as an allowed mimetype'],
    ['x.pdf', 'text/html', 'allowed extension with a disallowed mimetype'],
    ['x.png', 'application/pdf', 'two allowed values that do not pair up'],
    ['noextension', 'application/pdf', 'no extension'],
    ['x.pdf.html', 'application/pdf', 'only the last extension counts'],
    ['x.constructor', 'application/pdf', 'prototype key as extension'],
    [undefined, 'application/pdf', 'missing name'],
    ['x.pdf', undefined, 'missing mimetype'],
  ])('rejects %s (%s): %s', (name, mimetype) => {
    expect(isAllowedUploadType(name, mimetype)).toBe(false);
  });

  it('ignores case of extension and mimetype', () => {
    expect(isAllowedUploadType('SCAN.PDF', 'Application/PDF')).toBe(true);
  });
});
