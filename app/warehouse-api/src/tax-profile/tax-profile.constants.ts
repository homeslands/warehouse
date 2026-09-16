/**
 * API công khai tra cứu doanh nghiệp theo mã số thuế (nguồn dữ liệu: Tổng cục Thuế `gdt.gov.vn`).
 * Không cần API key. Có thể ghi đè bằng env `VIETQR_BUSINESS_API_URL`; cố ý KHÔNG khai trong
 * `env.validation.ts` để `.env` cũ không thiếu biến rồi crash lúc bootstrap.
 */
export const VIETQR_BUSINESS_API_URL = 'https://api.vietqr.io/v2/business';

export const VIETQR_TIMEOUT_MS = 10_000;

/**
 * ⚠️ Upstream LUÔN trả HTTP 200, kể cả khi lỗi — trạng thái thật nằm ở field `code` trong body.
 * Bắt lỗi bằng HTTP status ở đây là sai. (Đã kiểm chứng bằng request thật, xem
 * `docs/specs/tax-profile.md` mục "Hợp đồng với upstream".)
 */
export const VIETQR_CODE_SUCCESS = '00';
export const VIETQR_CODE_TAX_NOT_FOUND = '51';
export const VIETQR_CODE_TAX_INVALID = '52';

/** Mã số thuế: 10 chữ số, kèm hậu tố chi nhánh 3 chữ số tuỳ chọn. Giống `STORE_TAX_CODE_REGEX`. */
export const TAX_PROFILE_TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/;

/**
 * Nhận mã chi nhánh ở DTO (regex trên) rồi mới chặn ở service bằng regex này — để trả lỗi riêng
 * "chưa hỗ trợ mã chi nhánh" thay vì "mã số thuế không tồn tại" gây hiểu nhầm. Upstream trả
 * `code: 51` cho mọi mã có hậu tố chi nhánh (đã kiểm chứng với `0101245486-001`).
 */
export const TAX_PROFILE_BRANCH_SUFFIX_REGEX = /-\d{3}$/;
