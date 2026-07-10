import type viErrors from '@/shared/i18n/locales/vi/errors.json'

/** Tên khoá hợp lệ trong namespace `errors`, suy ra từ chính bản dịch tiếng Việt. */
export type ErrorMessageKey = keyof typeof viErrors

/**
 * Map mã lỗi số của backend → tên khoá trong namespace i18n `errors`.
 *
 * Đây là nguồn chân lý THỨ HAI: backend khai mã trong `src/**\/*.validation.ts`, còn đây là bản
 * sao thủ công. Thêm mã mới ở backend mà quên khai ở đây thì `resolveApiErrorMessage` sẽ rơi về
 * `message` tiếng Anh của backend và ghi console.warn — hỏng có kiểm soát, không im lặng.
 */
export const ERROR_CODE_KEYS: Record<number, ErrorMessageKey> = {
  100001: 'invalidCredentials',
  100002: 'userNotActive',
  100005: 'phonenumberDoesExist',
  100006: 'phonenumberIsRequired',
  100007: 'passwordIsRequired',
  100101: 'roleNotFound',
  109000: 'exportDatabaseError',
  121000: 'fileNotFound',
  121001: 'fileSizeExceedsLimitAllowed',
  121002: 'numberOfFilesExceedLimitAllowed',
  121003: 'limitUnexpectedFile',
  121004: 'limitPartCount',
  121005: 'limitFieldKey',
  121006: 'limitFieldCount',
  121007: 'limitFieldValue',
  121008: 'multerError',
  121009: 'errorWhenUploadFile',
  121010: 'mustExcelFile',
  121011: 'excelFileWrongHeader',
  155501: 'notificationNotFound',
  155502: 'senderNotFound',
  155503: 'receiverNotFound',
  155504: 'notificationCreateFailed',
  999901: 'exampleNotFound',
  999902: 'exampleNameDoesExist',
  999903: 'exampleNameIsRequired',
}
