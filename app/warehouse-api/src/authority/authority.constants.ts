/**
 * Toàn bộ `Authority.code` dùng trong `@RequireAuthority(...)` — nguồn duy nhất, không endpoint nào
 * được truyền chuỗi rời (`RequireAuthority` nhận `TAuthorityCode` nên chuỗi lạ là lỗi compile).
 * Gõ sai chuỗi thì guard im lặng khoá endpoint: không có `code` trong DB ⇒ mọi role trừ
 * `SUPER_ADMIN` đều bị chặn, không có lỗi nào báo ra.
 *
 * Chỉ `code` nằm ở đây. Tên hiển thị, nhóm hiển thị và quyền cấp sẵn cho từng role nằm trong
 * migration seed tương ứng, vì 3 thứ đó là DỮ LIỆU: sau khi migrate, nguồn sự thật là
 * `authority_tbl`/`permission_tbl` (sửa được qua API quản trị permission), còn `code` là khoá tra
 * cứu bất biến mà code phải khớp.
 *
 * Nhóm theo migration đã seed chúng, và thêm 1 hằng ở đây thì phải viết KÈM 1 migration seed đúng
 * `code` đó — xem `docs/specs/authority-permission.md`, `Authority` row không bao giờ được tạo lúc
 * runtime.
 */
export const AuthorityCode = {
  // --- Seed ở migration 1783728000009 ---
  ExampleCreate: 'EXAMPLE_CREATE',
  ExampleUpdate: 'EXAMPLE_UPDATE',
  ExampleDelete: 'EXAMPLE_DELETE',
  ManagePermissions: 'MANAGE_PERMISSIONS',
  DbBackup: 'DB_BACKUP',
  LoggerRead: 'LOGGER_READ',

  // --- Seed ở migration 1783728000010 ---
  UserCreate: 'USER_CREATE',
  UserRead: 'USER_READ',

  // --- Seed ở migration 1783728000011 ---
  UserChangePassword: 'USER_CHANGE_PASSWORD',

  // ===== Seed ở migration 1783728000012 (bảng phân quyền 5.5) =====
  // --- Phiếu nhập kho (ImportForm) ---
  ImportFormCreate: 'IMPORT_FORM_CREATE',
  ImportFormRead: 'IMPORT_FORM_READ',
  ImportFormUpdateDraft: 'IMPORT_FORM_UPDATE_DRAFT',
  ImportFormUpdateDraftOwn: 'IMPORT_FORM_UPDATE_DRAFT_OWN',
  ImportFormDeleteDraft: 'IMPORT_FORM_DELETE_DRAFT',
  ImportFormDeleteDraftOwn: 'IMPORT_FORM_DELETE_DRAFT_OWN',
  ImportFormConfirm: 'IMPORT_FORM_CONFIRM',
  ImportFormExport: 'IMPORT_FORM_EXPORT',

  // --- Phiếu xuất kho (ExportForm) ---
  ExportFormCreate: 'EXPORT_FORM_CREATE',
  ExportFormRead: 'EXPORT_FORM_READ',
  ExportFormUpdateDraft: 'EXPORT_FORM_UPDATE_DRAFT',
  ExportFormUpdateDraftOwn: 'EXPORT_FORM_UPDATE_DRAFT_OWN',
  ExportFormDeleteDraft: 'EXPORT_FORM_DELETE_DRAFT',
  ExportFormDeleteDraftOwn: 'EXPORT_FORM_DELETE_DRAFT_OWN',
  ExportFormConfirm: 'EXPORT_FORM_CONFIRM',
  ExportFormExport: 'EXPORT_FORM_EXPORT',
  ExportFormApproveDisposal: 'EXPORT_FORM_APPROVE_DISPOSAL',

  // --- Phiếu kiểm kho (BalanceForm) ---
  BalanceFormCreate: 'BALANCE_FORM_CREATE',
  BalanceFormRead: 'BALANCE_FORM_READ',
  BalanceFormReadAssigned: 'BALANCE_FORM_READ_ASSIGNED',
  BalanceFormRecordCount: 'BALANCE_FORM_RECORD_COUNT',
  BalanceFormRecordCountAssigned: 'BALANCE_FORM_RECORD_COUNT_ASSIGNED',
  BalanceFormComplete: 'BALANCE_FORM_COMPLETE',
  BalanceFormCompleteAssigned: 'BALANCE_FORM_COMPLETE_ASSIGNED',
  BalanceFormApprove: 'BALANCE_FORM_APPROVE',

  // --- Phiếu chi kho (WarehousePayment) ---
  WarehousePaymentCreate: 'WAREHOUSE_PAYMENT_CREATE',
  WarehousePaymentRead: 'WAREHOUSE_PAYMENT_READ',
  WarehousePaymentReadOwn: 'WAREHOUSE_PAYMENT_READ_OWN',
  WarehousePaymentUpdateDraft: 'WAREHOUSE_PAYMENT_UPDATE_DRAFT',
  WarehousePaymentUpdateDraftOwn: 'WAREHOUSE_PAYMENT_UPDATE_DRAFT_OWN',
  WarehousePaymentApprove: 'WAREHOUSE_PAYMENT_APPROVE',
  WarehousePaymentExport: 'WAREHOUSE_PAYMENT_EXPORT',
} as const;
export type TAuthorityCode = (typeof AuthorityCode)[keyof typeof AuthorityCode];
