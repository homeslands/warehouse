import { RoleEnum } from 'src/role/role.enum';

export const WAREHOUSE_PHONENUMBER_REGEX = /^0\d{8,10}$/;

/**
 * Mã kho nghiệp vụ, vd `WH-HN-01`: 2-32 ký tự chữ/số/gạch ngang, không bắt đầu hoặc kết thúc bằng
 * gạch ngang. Nhận cả chữ thường vì DTO tự `toUpperCase()` trước khi lưu.
 */
export const WAREHOUSE_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/;

/**
 * Role chỉ được thấy kho mình là manager hoặc thành viên ở `GET /warehouses` và `GET /stores`
 * (cửa hàng gắn với các kho đó). Role không nằm đây thấy toàn bộ.
 */
export const WAREHOUSE_SCOPED_ROLES = [RoleEnum.Manager, RoleEnum.Supervisor];

/**
 * Role KHÔNG được gán làm thành viên kho (`PUT /warehouses/{slug}/members`) và bị loại khỏi
 * `GET .../available-members`: ADMIN/SUPER_ADMIN đã thấy và thao tác được mọi kho.
 */
export const WAREHOUSE_MEMBER_EXCLUDED_ROLES = [RoleEnum.Admin, RoleEnum.SuperAdmin];
