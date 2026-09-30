# Đặc tả: luật giới hạn việc cấp/gỡ quyền (permission delegation rules)

| | |
|---|---|
| Người viết | frontend (warehouse-ui) |
| Ngày | 2026-09-25 |
| Trạng thái | **Đã chốt hướng: ủy quyền cho cấp dưới (hướng 2).** Còn 2 điểm mở, đều có giá trị mặc định (mục 13). |
| Người thực hiện | **Backend** (bắt buộc) — `app/warehouse-api`. **Frontend** phản chiếu lại (mục 11). |
| Căn cứ | Code trên `origin/dev` ngày 2026-09-25 |
| Liên quan | `2026-09-24-authority-based-guards.md` — backend đã gác endpoint bằng authority (`WMS-10-be(1)`) |

Quy ước trong tài liệu: **PHẢI** / **KHÔNG ĐƯỢC** là yêu cầu bắt buộc. **NÊN** là khuyến nghị.
Tên mã, tên hàm, đường dẫn giữ nguyên tiếng Anh như trong code.

---

## 1. Tóm tắt

Người có quyền `MANAGE_PERMISSIONS` hiện cấp/gỡ được **mọi quyền cho mọi vai trò, kể cả vai trò của
chính mình**. Tài liệu này thêm bốn luật ở backend:

- **R1** — chỉ sửa được vai trò **thấp hơn** mình.
- **R2** — chỉ cấp/gỡ được mã **mình đang có**.
- **R3** — một số mã đặc biệt (gồm `MANAGE_PERMISSIONS`) **chỉ SUPER_ADMIN** cấp/gỡ được.
- **R4** — **không được gỡ** `MANAGE_PERMISSIONS` khỏi vai trò cuối cùng còn giữ nó.

Kèm theo: **lưu vết** mọi lần cấp/gỡ, kể cả lần bị từ chối.

---

## 2. Bối cảnh: hệ thống hiện tại

| Thành phần | Hiện trạng | Vị trí |
|---|---|---|
| Vai trò | Đúng 4 vai trò cố định: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `SUPERVISOR`. `POST /roles` chỉ nhận tên trong `RoleEnum`. | `role.enum.ts`, `role.dto.ts` |
| Quyền | 60 mã `Authority.code`. Mỗi vai trò có một tập mã (bảng `permission_tbl`). | `authority.constants.ts` |
| Gác endpoint | `@RequireAuthority(A, B, …)`. Nhiều mã là **AND**. | `authority.decorator.ts`, `role.guard.ts` |
| SUPER_ADMIN | Bỏ qua mọi kiểm tra quyền. Không có dòng nào trong `permission_tbl`. Tài khoản `root` luôn được seed lúc khởi động. | `role.guard.ts`, `RootUserSeeder` |
| Cấp/gỡ quyền | `PUT` / `DELETE /roles/:roleSlug/authorities/:authorityCode`, gác bằng `MANAGE_PERMISSIONS`. | `permission.controller.ts` |
| Logic cấp/gỡ | `grant()` / `revoke()` **chỉ** kiểm tra vai trò và mã có tồn tại không, rồi ghi DB và xoá cache RBAC. | `permission.service.ts` |
| Seed mặc định | `MANAGE_PERMISSIONS` chỉ cấp cho `ADMIN`. | migration `1783728000009` |
| Phía FE | Màn `/permissions` khoá switch của "vai trò cuối cùng giữ `MANAGE_PERMISSIONS`". **Chỉ chặn ở FE.** | `features/permission-matrix` |

---

## 3. Vấn đề

Khi `MANAGE_PERMISSIONS` được cấp cho một vai trò khác ngoài ADMIN (ví dụ MANAGER), vai trò đó:

1. **Tự cấp được mọi quyền cho chính mình**, tức là thực chất thành admin toàn quyền.
2. **Sửa được quyền của vai trò cao hơn** (MANAGER cấp hoặc gỡ quyền của ADMIN).
3. **Truyền tiếp được `MANAGE_PERMISSIONS`** cho vai trò khác.
4. **Gỡ được quyền quản trị khỏi vai trò cuối cùng**, khiến không còn tài khoản thường nào vào được màn
   phân quyền. Chốt ở FE không ngăn được khi gọi thẳng API.

---

## 4. Quyết định

**Chọn hướng 2: cho phép ủy quyền quản lý quyền xuống cấp dưới, có giới hạn.** Ví dụ: MANAGER được
quản lý quyền của SUPERVISOR, trong phạm vi quyền MANAGER đang có.

Phương án bị loại: "chỉ SUPER_ADMIN/ADMIN quản lý quyền, không ủy quyền". Phương án này vẫn thực hiện
được bằng cách không cấp `MANAGE_PERMISSIONS` cho MANAGER. Các luật dưới đây vẫn đúng trong trường hợp
đó.

---

## 5. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Người gọi** (actor) | Tài khoản gọi API cấp/gỡ quyền. Vai trò và `scope` của họ lấy từ `CurrentUserDto` (JWT + cache RBAC), giống `AuthorityGuard`. |
| **Vai trò đích** (target role) | Vai trò có `roleSlug` trong URL. |
| **Mã** (code) | `authorityCode` trong URL. |
| **Cấp bậc** (rank) | Số thứ tự của vai trò, xem bên dưới. Số lớn hơn = cấp cao hơn. |
| **Mã đặc biệt** | Mã thuộc `PROTECTED_AUTHORITY_CODES` (R3). |

```ts
// Ghi cứng theo tên: RoleEnum cố định 4 giá trị, không cần thêm cột vào DB.
const ROLE_RANK: Record<RoleEnum, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  MANAGER: 2,
  SUPERVISOR: 1,
}
```

---

## 6. Các luật

### Phạm vi áp dụng

| Luật | Áp cho SUPER_ADMIN? |
|---|---|
| R1, R2, R3 | **Không.** SUPER_ADMIN được miễn (tài khoản cứu hộ). |
| R4 | **Có.** Áp cho mọi người gọi, kể cả SUPER_ADMIN. |

Thứ tự kiểm tra: **R3 → R1 → R2 → R4**. Gặp luật đầu tiên bị vi phạm thì dừng và trả lỗi của luật đó.

### R1. Chỉ sửa vai trò thấp hơn mình

**Luật:** người gọi **PHẢI** có `ROLE_RANK[vai trò người gọi] > ROLE_RANK[vai trò đích]`. Bằng hoặc
thấp hơn thì **KHÔNG ĐƯỢC** cấp hay gỡ.

| Người gọi | Được sửa | Không được sửa |
|---|---|---|
| SUPER_ADMIN | tất cả (miễn R1) | — |
| ADMIN | MANAGER, SUPERVISOR | ADMIN (chính mình), SUPER_ADMIN |
| MANAGER | SUPERVISOR | MANAGER (chính mình), ADMIN, SUPER_ADMIN |
| SUPERVISOR | — | tất cả |

**Hệ quả:**
- Không ai tự sửa được quyền của vai trò mình.
- Quyền của ADMIN chỉ SUPER_ADMIN sửa được.

**Mở rộng:** `POST /roles`, `PATCH /roles/:slug`, `PATCH /authorities/:slug` hiện cũng chỉ gác bằng
`MANAGE_PERMISSIONS`. Ba endpoint này **PHẢI** chỉ cho SUPER_ADMIN dùng, vì sửa định nghĩa vai
trò/quyền là thay đổi cấu trúc, không phải ủy quyền.

**Lỗi:** HTTP 403, `ROLE_RANK_NOT_ALLOWED`.

### R2. Trần quyền: chỉ cấp/gỡ mã mình đang có

**Luật:** mã **PHẢI** nằm trong `scope` của người gọi tại thời điểm gọi.

- **Cấp:** vai trò đích không bao giờ nhận được mã mà người gọi không có. MANAGER "cấp full quyền" cho
  SUPERVISOR thực chất chỉ cấp được đúng các mã MANAGER đang có.
- **Gỡ:** theo mặc định **(a) đối xứng**, luật áp cho cả gỡ: chỉ gỡ được mã mình cũng có. Xem điểm mở
  số 1 ở mục 13.
- `scope` đọc từ cache RBAC như guard đang làm. Người gọi vừa bị thu mã thì lần gọi kế tiếp bị từ chối
  ngay.

**Lỗi:** HTTP 403, `AUTHORITY_NOT_HELD`.

### R3. Mã đặc biệt: chỉ SUPER_ADMIN cấp/gỡ

**Luật:** nếu mã thuộc `PROTECTED_AUTHORITY_CODES` thì người gọi **PHẢI** là SUPER_ADMIN.

Danh sách mặc định (là các mã BRD xếp vào "Chỉ ADMIN"; xem điểm mở số 2 ở mục 13):

```ts
// Khai cạnh AuthorityCode trong authority.constants.ts — FE chép lại danh sách này.
export const PROTECTED_AUTHORITY_CODES = [
  AuthorityCode.ManagePermissions,
  AuthorityCode.DbBackup,
  AuthorityCode.LoggerRead,
  AuthorityCode.UserCreate,
  AuthorityCode.UserChangePassword,
] as const
```

**Hệ quả:** không ai ngoài SUPER_ADMIN trao được quyền quản trị phân quyền. Việc lan quyền (vấn đề số
3) bị chặn hoàn toàn.

**Lỗi:** HTTP 403, `AUTHORITY_PROTECTED`.

### R4. Không gỡ quyền quản trị khỏi vai trò cuối cùng

**Mục đích:** chống **tự khoá cửa**. Màn phân quyền chỉ ai có `MANAGE_PERMISSIONS` mới vào được. Nếu
không còn vai trò nào giữ mã này, không tài khoản thường nào vào được màn phân quyền để cấp lại. Chỉ
còn cách đăng nhập `root` hoặc sửa thẳng DB.

```
Trước:   MANAGE_PERMISSIONS   ADMIN ✅   MANAGER ❌   SUPERVISOR ❌
Gỡ khỏi ADMIN → sau khi gỡ không còn ai giữ → PHẢI từ chối
```

**Luật:** khi gỡ `MANAGE_PERMISSIONS` khỏi một vai trò, nếu **sau khi gỡ** không còn vai trò nào (không
tính SUPER_ADMIN) giữ mã này, thì **KHÔNG ĐƯỢC** gỡ.

**Bắt buộc về kỹ thuật:** việc đếm và việc xoá **PHẢI** nằm trong cùng một transaction, có khoá các dòng
`permission_tbl` của mã này (`SELECT … FOR UPDATE`). Nếu không, hai lệnh gỡ đồng thời sẽ cùng lọt:

```
ADMIN và MANAGER cùng giữ quyền. Hai người bấm gỡ cùng lúc:
  Lệnh 1: gỡ khỏi ADMIN   → đếm: "còn MANAGER giữ" → qua
  Lệnh 2: gỡ khỏi MANAGER → đếm: "còn ADMIN giữ"   → qua
  Kết quả: không còn ai giữ.
```

Có khoá thì hai lệnh chạy lần lượt: lệnh sau đếm được "không còn ai khác" và bị từ chối.

**Ghi chú:** do R3, trên thực tế chỉ SUPER_ADMIN gỡ được mã này, nên R4 chủ yếu bảo vệ SUPER_ADMIN khỏi
bấm nhầm. Vì vậy R4 **ưu tiên thấp hơn** R1–R3 và có thể làm ở đợt sau.

**Lỗi:** HTTP 409, `LAST_PERMISSION_ADMIN`.

---

## 7. Thuật toán tham chiếu (backend)

Đặt trong `permission.service.ts`, gọi ở đầu `grant()` và `revoke()`. Service **PHẢI** nhận thêm người
gọi (`CurrentUserDto`) từ controller.

```ts
function assertCanChangePermission(
  actor: CurrentUserDto,
  targetRole: Role,
  code: TAuthorityCode,
): void {
  if (actor.roleName === RoleEnum.SuperAdmin) return // miễn R1–R3

  // R3
  if (PROTECTED_AUTHORITY_CODES.includes(code)) {
    throw new PermissionException(PermissionValidation.AUTHORITY_PROTECTED)
  }
  // R1
  if (ROLE_RANK[actor.roleName] <= ROLE_RANK[targetRole.name]) {
    throw new PermissionException(PermissionValidation.ROLE_RANK_NOT_ALLOWED)
  }
  // R2 — mặc định (a): áp cho cả GRANT lẫn REVOKE
  if (!actor.scope.includes(code)) {
    throw new PermissionException(PermissionValidation.AUTHORITY_NOT_HELD)
  }
}

async function revoke(actor: CurrentUserDto, roleSlug: string, code: TAuthorityCode) {
  const { role, authority } = await this.resolve(roleSlug, code)
  assertCanChangePermission(actor, role, code)

  await this.dataSource.transaction(async (tx) => {
    // R4 — áp cho mọi người gọi, kể cả SUPER_ADMIN
    if (code === AuthorityCode.ManagePermissions) {
      const holders = await tx
        .getRepository(Permission)
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .innerJoin('p.authority', 'a', 'a.code = :code', { code })
        .innerJoinAndSelect('p.role', 'r')
        .getMany()
      const remaining = holders.filter((p) => p.role.id !== role.id)
      if (holders.some((p) => p.role.id === role.id) && remaining.length === 0) {
        throw new PermissionException(PermissionValidation.LAST_PERMISSION_ADMIN)
      }
    }
    await tx.getRepository(Permission).delete({ role: { id: role.id }, authority: { id: authority.id } })
  })
  await this.rbacService.invalidateRole(role)
}
```

Đây là mã minh hoạ để thống nhất hành vi, không phải mã bắt buộc chép nguyên. Tên exception và
validation theo quy ước hiện có của backend.

---

## 8. Mã lỗi

Mọi lỗi **PHẢI** có `code` trong body theo dải mã lỗi đang dùng của backend. Số cụ thể do backend chọn.
Hiện 403 do guard trả về không có `code`, FE phải so theo câu `"Forbidden resource"`, và bốn lỗi mới
**KHÔNG ĐƯỢC** lặp lại tình trạng này.

| Tên | HTTP | Luật | Câu hiển thị (FE) |
|---|---|---|---|
| `AUTHORITY_PROTECTED` | 403 | R3 | Quyền này chỉ quản trị viên cấp cao nhất cấp được. |
| `ROLE_RANK_NOT_ALLOWED` | 403 | R1 | Bạn chỉ chỉnh được quyền của vai trò cấp thấp hơn mình. |
| `AUTHORITY_NOT_HELD` | 403 | R2 | Bạn không có quyền này nên không cấp/gỡ được cho người khác. |
| `LAST_PERMISSION_ADMIN` | 409 | R4 | Đây là vai trò cuối cùng còn quyền quản trị phân quyền. Hãy cấp cho vai trò khác trước. |

---

## 9. Endpoint bị ảnh hưởng

| Endpoint | Trước | Sau |
|---|---|---|
| `PUT /roles/:roleSlug/authorities/:authorityCode` | `MANAGE_PERMISSIONS` | `MANAGE_PERMISSIONS` + R3, R1, R2 |
| `DELETE /roles/:roleSlug/authorities/:authorityCode` | `MANAGE_PERMISSIONS` | `MANAGE_PERMISSIONS` + R3, R1, R2, R4 |
| `POST /roles` | `MANAGE_PERMISSIONS` | **Chỉ SUPER_ADMIN** |
| `PATCH /roles/:slug` | `MANAGE_PERMISSIONS` | **Chỉ SUPER_ADMIN** |
| `PATCH /authorities/:slug` | `MANAGE_PERMISSIONS` | **Chỉ SUPER_ADMIN** |
| `GET /roles`, `GET /authorities` | chỉ cần đăng nhập | Không đổi |

---

## 10. Lưu vết (audit)

BRD §3.2 yêu cầu audit trail cho mọi giao dịch quan trọng. Mỗi lần gọi cấp/gỡ **PHẢI** ghi một dòng,
**kể cả khi bị từ chối**, vì đó là dấu hiệu có người thử vượt quyền.

| Trường | Kiểu | Ví dụ |
|---|---|---|
| `actorUserId` | string | `ef82400d-…` |
| `actorRole` | RoleEnum | `MANAGER` |
| `targetRole` | RoleEnum | `SUPERVISOR` |
| `authorityCode` | TAuthorityCode | `IMPORT_FORM_CREATE` |
| `action` | `GRANT` \| `REVOKE` | `GRANT` |
| `result` | `OK` \| tên mã lỗi ở mục 8 | `ROLE_RANK_NOT_ALLOWED` |
| `createdAt`, `ip`, `requestId` | | |

Endpoint đọc (ví dụ `GET /permission-audits`, có phân trang, lọc theo người gọi/vai trò/mã/khoảng thời
gian) **NÊN** chỉ dành cho ADMIN trở lên, đúng như BRD xếp audit trail vào mục "Chỉ ADMIN".

---

## 11. Phía frontend

Frontend phản chiếu từng luật để người dùng chỉ thấy những thao tác mình thật sự làm được. **Chặn ở FE
không thay thế chặn ở backend.**

| Luật | Trên màn `/permissions` |
|---|---|
| R1 | Cột của vai trò ngang hoặc cao hơn người dùng hiện ở dạng chỉ đọc (✓ / —), không có switch. Tiêu đề cột có dòng giải thích. |
| R2 | Switch của mã người dùng không có bị khoá, rê chuột thấy lý do. |
| R3 | Dòng của mã đặc biệt bị khoá với mọi người, trừ SUPER_ADMIN. |
| R4 | Giữ khoá "vai trò cuối cùng" hiện có. |
| Mục 8 | Mỗi mã lỗi có câu tiếng Việt riêng, hiện ngay khi bị từ chối (phòng FE và BE lệch nhau). |

Việc khác ở FE:
- Chép `ROLE_RANK` vào `src/entities/session/model/roles.ts` (cạnh `ROLES`) và
  `PROTECTED_AUTHORITY_CODES` vào `src/shared/api/authority-codes.ts`.
- Gỡ hộp cảnh báo "tự thu hồi quyền quản trị của chính mình": với R1, ca này không còn xảy ra với ai
  ngoài SUPER_ADMIN.
- Dựng sau cờ `permissionDelegationRules` trong `src/shared/api/backend-capabilities.ts`, bật cùng
  lúc backend deploy. **Đã dựng xong (2026-09-25)**: luật ở
  `src/features/permission-matrix/model/cell-rules.ts`; còn chờ backend báo số của bốn mã lỗi ở
  mục 8 để FE dịch sang câu tiếng Việt.

---

## 12. Ca kiểm thử nghiệm thu (backend)

Giả định scope theo seed mặc định, trừ khi ghi khác.

| # | Người gọi | Thao tác | Kỳ vọng |
|---|---|---|---|
| 1 | MANAGER | Cấp bất kỳ mã nào cho MANAGER | 403 `ROLE_RANK_NOT_ALLOWED` |
| 2 | MANAGER | Gỡ một mã của ADMIN | 403 `ROLE_RANK_NOT_ALLOWED` |
| 3 | MANAGER có `IMPORT_FORM_CREATE` | Cấp `IMPORT_FORM_CREATE` cho SUPERVISOR | 200 |
| 4 | MANAGER không có `WAREHOUSE_DELETE` | Cấp `WAREHOUSE_DELETE` cho SUPERVISOR | 403 `AUTHORITY_NOT_HELD` |
| 5 | MANAGER không có `WAREHOUSE_DELETE` | Gỡ `WAREHOUSE_DELETE` của SUPERVISOR | 403 `AUTHORITY_NOT_HELD` (theo mặc định (a)) |
| 6 | ADMIN | Cấp `MANAGE_PERMISSIONS` cho MANAGER | 403 `AUTHORITY_PROTECTED` |
| 7 | SUPER_ADMIN | Cấp `MANAGE_PERMISSIONS` cho MANAGER | 200 |
| 8 | ADMIN | Cấp hoặc gỡ bất kỳ mã nào của ADMIN | 403 `ROLE_RANK_NOT_ALLOWED` |
| 9 | ADMIN | `PATCH /roles/:slug` | 403 |
| 10 | SUPER_ADMIN | Gỡ `MANAGE_PERMISSIONS` khỏi vai trò cuối cùng còn giữ | 409 `LAST_PERMISSION_ADMIN` |
| 11 | Hai phiên đồng thời | Gỡ `MANAGE_PERMISSIONS` khỏi hai vai trò cuối cùng | Đúng một lệnh thành công, lệnh kia 409 |
| 12 | Bất kỳ | Mọi ca trên | Đúng một dòng lưu vết mỗi lần gọi, kể cả khi bị từ chối |

---

## 13. Điểm còn mở

Hai điểm dưới đây đều có **giá trị mặc định**. Nếu nghiệp vụ chưa chốt, triển khai theo mặc định.

| # | Câu hỏi | Mặc định | Phương án khác |
|---|---|---|---|
| 1 | R2 có áp cho **gỡ** không? | **(a) Có:** chỉ gỡ được mã mình cũng có. Người quản lý chỉ động vào quyền trong phạm vi của mình. | **(b) Không:** gỡ được mọi mã của vai trò thấp hơn. Dễ dọn dẹp hơn, nhưng MANAGER tắt được cả quyền ADMIN cấp riêng cho SUPERVISOR. Nếu chọn (b), bỏ kiểm tra R2 khi `action = REVOKE` và đổi kỳ vọng ca #5 thành 200. |
| 2 | Danh sách `PROTECTED_AUTHORITY_CODES` | 5 mã ở R3 | Thêm hoặc bớt. Các mã phiếu và kho **không nên** vào danh sách này, vì đó chính là phần MANAGER cần ủy quyền cho SUPERVISOR. |

---

## 14. Ngoài phạm vi

- Luật theo từng bản ghi, ví dụ "SUPERVISOR chỉ thấy phiếu của mình". Đó là việc lọc dữ liệu ở từng
  module, không phải việc cấp/gỡ quyền.
- Duyệt hai người (một người đề xuất đổi quyền, người khác duyệt).
- Quyền theo từng kho hoặc từng cửa hàng (một MANAGER chỉ quản lý kho được giao).
