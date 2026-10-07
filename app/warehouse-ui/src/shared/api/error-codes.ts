import type viErrors from '@/shared/i18n/locales/vi/errors.json'

/** Tên khoá hợp lệ trong namespace `errors`, suy ra từ chính bản dịch tiếng Việt. */
export type ErrorMessageKey = keyof typeof viErrors

/** Backend `DATA_VERSION_CONFLICT` (409): bản ghi vừa bị người khác sửa. */
export const DATA_VERSION_CONFLICT_CODE = 100800

/**
 * Map mã lỗi số của backend → tên khoá trong namespace i18n `errors`.
 *
 * Đây là nguồn chân lý THỨ HAI: backend khai mã trong `src/**\/*.validation.ts`, còn đây là bản
 * sao thủ công. Thêm mã mới ở backend mà quên khai ở đây thì `resolveApiErrorMessage` sẽ rơi về
 * `message` tiếng Anh của backend và ghi console.warn — hỏng có kiểm soát, không im lặng.
 */
export const ERROR_CODE_KEYS: Record<number, ErrorMessageKey> = {
  // Đồng bộ với warehouse-api src/auth/auth.validation.ts và src/user/user.validation.ts
  // (2026-09-17). Backend không tái dùng số đã bỏ; khi backend đổi, sửa ở đây và errors.json.
  100001: 'invalidCredentials',
  100002: 'userNotActive',
  100003: 'invalidRefreshToken',
  100004: 'refreshTokenExpired',
  100005: 'refreshTokenRevoked',
  100006: 'phonenumberIsRequired',
  100007: 'passwordIsRequired',
  100008: 'refreshTokenIsRequired',
  100011: 'newPasswordIsRequired',
  100012: 'currentPasswordIsRequired',
  100013: 'currentPasswordIncorrect',
  100401: 'phonenumberDoesExist',
  100402: 'phonenumberIsRequired',
  100403: 'passwordIsRequired',
  100404: 'roleSlugIsRequired',
  100405: 'userNotFound',
  100406: 'newPasswordIsRequired',
  100407: 'changePasswordForbidden',
  100408: 'changeOwnPasswordNotAllowed',
  100409: 'phonenumberInvalid',
  // warehouse-api src/user/user.validation.ts — hồ sơ người dùng (2026-09-30).
  100410: 'firstNameIsRequired',
  100411: 'lastNameIsRequired',
  100412: 'dobInvalid',
  100413: 'emailInvalid',
  // warehouse-api src/user/user.validation.ts — sửa / khoá / đổi vai trò (PR #72, 2026-10-05).
  100414: 'lockOwnAccountNotAllowed',
  100415: 'userIsWarehouseManager',
  100416: 'changeOwnRoleNotAllowed',
  100417: 'adminCannotManageAdmin',
  // PR #78 (2026-10-07).
  100418: 'deleteOwnAccountNotAllowed',
  100419: 'phonenumberReservedByDeletedUser',
  100420: 'userStartDateInvalid',
  100421: 'userEndDateInvalid',
  100422: 'userDateRangeInvalid',
  100423: 'userBirthdayInvalid',
  100424: 'userSortInvalid',
  100425: 'userIsActiveInvalid',
  100101: 'roleNotFound',
  // warehouse-api src/role/role.validation.ts — gán/quản lý vai trò cùng cấp hoặc cao hơn mình.
  100104: 'roleLevelForbidden',
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
  100800: 'dataVersionConflict',
  // warehouse-api src/warehouse/warehouse.validation.ts (2026-09-22).
  100501: 'warehouseNotFound',
  100502: 'warehouseNameIsRequired',
  100503: 'warehouseNameDoesExist',
  100504: 'warehouseCodeIsRequired',
  100505: 'warehouseCodeInvalid',
  100506: 'warehouseCodeDoesExist',
  100507: 'warehouseCodeReserved',
  100508: 'warehouseAddressIsRequired',
  100509: 'warehousePhonenumberInvalid',
  100510: 'warehouseIsActiveInvalid',
  100511: 'warehouseHasManagerInvalid',
  100513: 'warehouseManagerSlugIsRequired',
  100514: 'warehouseManagerNotFound',
  100515: 'warehouseManagerInactive',
  100516: 'warehouseManagerRoleInvalid',
  100517: 'warehouseActiveCannotBeDeleted',
  // Thành viên kho (WMS-11 / PR #78). 100521 backend không dùng.
  100518: 'warehouseMemberUserSlugIsRequired',
  100519: 'warehouseMemberUserNotFound',
  100520: 'warehouseMemberUserInactive',
  100522: 'warehouseMemberNotFound',
  100523: 'warehouseAccessDenied',
  100524: 'warehouseMemberUserIsAdmin',
  // warehouse-api src/store/store.validation.ts (2026-09-22).
  101001: 'storeNotFound',
  101002: 'storeNameIsRequired',
  101003: 'storeNameDoesExist',
  101004: 'storeCodeIsRequired',
  101005: 'storeCodeInvalid',
  101006: 'storeCodeDoesExist',
  101007: 'storeCodeReserved',
  101008: 'storeLegalNameIsRequired',
  101009: 'storeTaxCodeIsRequired',
  101010: 'storeTaxCodeInvalid',
  101011: 'storeTaxCodeDoesExist',
  101012: 'storePhonenumberInvalid',
  101013: 'storeEmailInvalid',
  101014: 'storeIsActiveInvalid',
  101016: 'storeActiveCannotBeDeleted',
  101017: 'storeWarehouseSlugIsRequired',
  101018: 'storeWarehouseInactive',
  101019: 'storeWarehouseAlreadyAssigned',
  101020: 'storeWarehouseReserved',
}
