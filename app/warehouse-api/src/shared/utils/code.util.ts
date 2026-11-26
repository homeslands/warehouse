/**
 * Mã nghiệp vụ dùng chung cho danh mục vật tư (`MaterialType.code`, `Material.code`), vd `MT-01`:
 * 2-32 ký tự chữ/số/gạch ngang, không bắt đầu hoặc kết thúc bằng gạch ngang. Nhận cả chữ thường vì
 * mapper tự `toUpperCase()` trước khi lưu. (Mã kho không dùng regex này: server tự sinh `WH-001`.)
 */
export const BUSINESS_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/;

/**
 * Mã đơn vị tính (`Unit.code`): cùng công thức `BUSINESS_CODE_REGEX` nhưng cho phép 1 ký tự
 * (1-32) vì có ký hiệu đơn vị chuẩn chỉ 1 chữ, vd `L` (lít), `M` (mét), `G` (gam).
 */
export const UNIT_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])?$/;

export const normalizeCode = (value?: string): string | undefined => value?.trim().toUpperCase();
