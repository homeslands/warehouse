/**
 * Những thứ FE đã dựng sẵn nhưng backend CHƯA làm. Bật cờ khi backend xong — không phải sửa gì
 * thêm ở tầng UI.
 *
 * Để cờ thay vì xoá code: cả hai tính năng đều đã có hợp đồng hoặc gần có, và dựng lại từ đầu
 * lúc backend xong thì đắt hơn là giữ sẵn sau một cờ.
 *
 * **Đừng bật khi chưa kiểm bằng API thật.** Bật nhầm thì UI hiện mũi tên sắp xếp / ô tìm kiếm mà
 * dữ liệu không đổi — tệ hơn là không có, vì người dùng tưởng nó đang chạy.
 */
export const BACKEND_SUPPORTS = {
  /**
   * Sắp xếp theo cột. `BaseQueryDto` của backend ĐÃ khai `sort?: string[]`
   * (`app/warehouse-api/src/app/base.dto.ts`, mô tả ghi rõ dạng `['createdAt:DESC']`) nhưng
   * **không service nào đọc nó** — mọi danh sách phân trang đang cứng `createdAt DESC`.
   * Định dạng FE gửi bám đúng mô tả đó, nên khi backend hiện thực là khớp luôn.
   */
  sort: false,

  /**
   * Tìm theo từ khoá trên màn danh sách. Query DTO của kho/cửa hàng **chưa có tham số nào** cho
   * việc này (kho chỉ có `isActive` / `managerSlug` / `hasManager`, cửa hàng chỉ có `isActive`).
   * Tên tham số FE đang gửi là `search` — **chưa chốt với backend**. Nếu backend đặt tên khác
   * (`q`, `keyword`, `name`…) thì đổi khoá `search` trong `WarehouseFilters` và `StoreFilters`
   * (`entities/warehouse` và `entities/store`, file `model/types.ts`) và trong `FILTERS` của hai
   * màn danh sách — khoá của bộ lọc CHÍNH LÀ tên tham số `getPaginated` gửi đi.
   */
  search: false,

  /**
   * Sửa hồ sơ của chính mình (`PATCH /auth/me`). Backend CHƯA có endpoint này, và `user_tbl` cũng
   * chưa có cột `fullName` / `email` — xem
   * `docs/proposals/2026-09-23-account-profile-and-sessions.md`.
   */
  profileEdit: false,

  /**
   * Danh sách thiết bị đang đăng nhập và thu hồi từng phiên (`GET`/`DELETE /auth/sessions`).
   * Backend đã ký `sid` vào token và có blacklist theo phiên, chỉ thiếu hai endpoint này.
   */
  sessionList: false,

  /**
   * Backend gác **kho và người dùng** bằng `@RequireAuthority` — ĐÃ BẬT: backend deploy ở
   * `WMS-10-be(1)`. Route `/warehouses` gác bằng `WAREHOUSE_READ`, mỗi nút một mã
   * (`WAREHOUSE_CREATE`, `_UPDATE`, `_DELETE`, `_ASSIGN_MANAGER`, `USER_READ`) — luật ở
   * `pages/warehouses/model/abilities.ts`.
   *
   * Cờ còn giữ cho giai đoạn chuyển tiếp (tắt được nếu một môi trường chưa có bản backend mới).
   * Chạy ổn ở mọi môi trường thì gỡ cờ cùng nhánh `hasRole` trong `abilities.ts`.
   */
  authorityGuards: true,

  /**
   * Như `authorityGuards` nhưng cho **cửa hàng** — ĐÃ BẬT, cùng đợt `WMS-10-be(1)`. Gán kho cho cửa
   * hàng không có mã riêng: backend đòi `STORE_UPDATE` + `WAREHOUSE_UPDATE` (AND). Luật ở
   * `pages/stores/model/abilities.ts`.
   */
  storeAuthorityGuards: true,

  /**
   * Backend áp luật giới hạn cấp/gỡ quyền R1–R4 (`docs/proposals/2026-09-25-permission-delegation-rules.md`):
   * chỉ sửa vai trò thấp hơn mình, chỉ cấp/gỡ mã mình có, mã đặc biệt chỉ SUPER_ADMIN, không gỡ quyền
   * quản trị khỏi vai trò cuối cùng. Bật: màn `/permissions` khoá đúng những ô backend sẽ từ chối —
   * luật ở `features/permission-matrix/model/cell-rules.ts`.
   *
   * **Bật cùng lúc backend deploy.** Bật trước thì FE khoá mà backend vẫn cho — vô hại về bảo mật
   * nhưng người dùng không làm được việc backend đang cho phép.
   */
  permissionDelegationRules: true,

  /**
   * Sửa hồ sơ (`PATCH /users/{slug}`) + đổi vai trò (`POST /users/{slug}/change-role`), mã `USER_UPDATE` —
   * ĐÃ BẬT: backend deploy ở PR #72 (2026-10-05). `PATCH` chưa nhận `null` nên form không xoá trống được
   * trường tuỳ chọn.
   */
  userUpdate: true,

  /**
   * Khoá `PUT /users/{slug}/lock` + mở khoá `PUT /users/{slug}/unlock` (PR #78), mã `USER_UPDATE` — ĐÃ BẬT.
   * `DELETE /users/{slug}` giờ là XOÁ — FE không dùng.
   */
  userStatus: true,

  /**
   * PR #78 — `GET /users` nhận `name` / `phonenumber` / `isActive` / `warehouseSlug`; FE tách một ô tìm kiếm
   * thành `name`/`phonenumber` (`pages/users/model/search-query.ts`). Tách khỏi cờ `search` của kho/cửa hàng
   * vì hai module deploy khác đợt.
   */
  userSearch: true,

  /**
   * Sắp xếp theo cột RIÊNG màn Người dùng — backend `GET /users` đã đọc `sort` (PR #78; field: createdAt,
   * updatedAt, firstName, lastName, phonenumber, dob). Cờ `sort` chung vẫn tắt vì Kho/Cửa hàng chưa có.
   */
  userSort: true,

  /**
   * `GET /suppliers` nhận `search` (chứa chuỗi, OR trên name / contactPerson / email), `code` (khớp đúng, BE tự
   * viết hoa), `taxCode` (khớp đúng), `phonenumber` (chứa chuỗi) — ĐÃ BẬT: backend WMS-13 (PR #87/#88, `dev` qua
   * PR #89), thử với sandbox 2026-10-08. `name` riêng bị bỏ qua — tên đi qua `search`; `search` KHÔNG khớp mã. Một ô
   * tìm, FE đoán tham số theo dạng nhập (`pages/suppliers/model/search-query.ts`).
   */
  supplierSearch: true,

  /**
   * Sắp xếp theo cột màn Nhà cung cấp (FE gửi `sort[]=field:ASC|DESC`; cột khai `sortField`: code, name,
   * taxCode, phonenumber, createdAt). Backend đang làm — 2026-10-08 sandbox nhận `sort[]` nhưng vẫn cứng
   * `createdAt DESC`.
   */
  supplierSort: false,

  /**
   * Tab Giao dịch ở trang chi tiết nhà cung cấp (`GET`/`POST /suppliers/{slug}/transactions`). WMS-13 đã TẠM ẨN
   * hai endpoint này ("người dùng chưa được tự tạo giao dịch") — tắt thì trang chỉ còn Hồ sơ + Vật tư; code
   * tab vẫn giữ (`widgets/supplier-transactions`, `features/supplier-transaction-form`) để bật lại khi mở API.
   */
  supplierTransactions: false,

  /**
   * Tab Vật tư của trang chi tiết NCC: ô tìm (mã khớp đúng / tên chứa chuỗi) + khoảng ngày tạo vật tư —
   * `GET /suppliers/{slug}/materials` nhận `code` / `name` / `from` / `to` — ĐÃ BẬT (WMS-13, thử với sandbox
   * 2026-10-08; `from` sai định dạng → 101221).
   */
  supplierMaterialFilters: true,
} as const

/** Kiểu của một bộ cờ — để hàm nhận cờ làm tham số (test truyền `true` được; `as const` ghim `false`). */
export type BackendCapabilities = { readonly [K in keyof typeof BACKEND_SUPPORTS]: boolean }
