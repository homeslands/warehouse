/** Mã đơn vị (1–32 ký tự). Chép từ backend `shared/utils/code.util.ts`. */
export const UNIT_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])?$/

/** Mã nghiệp vụ chung (2–32 ký tự). Chép từ backend `shared/utils/code.util.ts`. */
export const BUSINESS_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/

/** Phần đầu của ô tìm vật tư gửi làm `name`: chữ (mọi ngôn ngữ), dấu, số, khoảng trắng. */
export const SEARCH_TEXT_REGEX = /^[\p{L}\p{M}\p{N}\s]+$/u

/** Phần đầu của ô tìm vật tư gửi làm `code`: chữ hoa, số, `_`, `-`. */
export const SEARCH_CODE_REGEX = /^[A-Z0-9_-]+$/
