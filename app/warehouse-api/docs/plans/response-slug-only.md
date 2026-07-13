# Plan: Bỏ field `id` khỏi mọi response, chỉ trả `slug`

## Context

Hiện `BaseResponseDto` (`src/app/base.dto.ts`) có cả `id` (uuid PK thật) lẫn `slug` — mọi response DTO kế thừa nó (`UserResponseDto`, `ExampleResponseDto`, `RoleResponseDto`, `AuthorityResponseDto`, `AuthorityGroupResponseDto`, `NotificationResponseDto`, `LoggerResponseDto`) đang trả cả 2. User yêu cầu: response chỉ trả `slug` làm định danh public, không lộ `id` thật ra ngoài; các field khác giữ nguyên đầy đủ. Đây là thay đổi hợp đồng response áp dụng cho toàn bộ API (không riêng module nào).

**Không đổi**: `Base.id` trên entity (`src/app/base.entity.ts`) vẫn giữ nguyên — đây là PK/FK dùng nội bộ (join, `@InjectRepository().findOneBy({id})` nếu có, quan hệ `@ManyToOne`...), chỉ bỏ `id` khỏi **response DTO** hướng ra ngoài. `CurrentUserDto.userId` (`GET /auth/me`) **giữ nguyên** — đã chốt với user: đây là identity/context nội bộ của request, đang dùng làm FK thật cho thao tác khác (vd `NotificationController.registerDeviceToken` gọi `user.userId`), không phải response của 1 resource CRUD nên không nằm trong phạm vi này. `FileResponseDto` không kế thừa `BaseResponseDto`, không có field `id`, không cần sửa.

## Khảo sát đã làm (đọc trực tiếp, không cần Explore agent)

- `src/app/base.dto.ts`: `BaseResponseDto` có 4 field `id`/`slug`/`createdAt`/`updatedAt`, đều `@AutoMap()`.
- `src/app/base.entity.ts`: `Base.id`/`slug`/`createdAt`/`updatedAt` đều có `@AutoMap()` — comment trong `base.mapper.ts` xác nhận `@automapper/classes` tự map theo tên thuộc tính trùng khớp giữa entity và DTO khi cả 2 phía đều có `@AutoMap()`, **không cần** `forMember` tường minh (kể cả cho `id` trước đây — file này chỉ tường minh hoá thêm cho chắc, không phải do `id` cần xử lý đặc biệt). Vậy khi `id` không còn tồn tại trên `BaseResponseDto`, `baseMapper()` không còn gì để map — xoá hẳn, không cần thay bằng no-op.
- 7 file gọi `baseMapper()` làm tham số thứ 4 của `createMap(..., Entity, ResponseDto, baseMapper())`: `src/user/user.mapper.ts`, `src/example/example.mapper.ts`, `src/role/role.mapper.ts`, `src/authority/authority.mapper.ts`, `src/authority-group/authority-group.mapper.ts`, `src/notification/notification.mapper.ts`, `src/logger/logger.mapper.ts`.
- Không route nào dùng `:id` làm param (đã grep `@Param('id')`/`:id\b` trong `src/`, không có kết quả) — mọi route đều theo `:slug`, nên bỏ `id` khỏi response không phá route nào.
- `CLAUDE.md` có 2 chỗ nhắc `baseMapper()` (dòng 90 mục "Automapper", dòng 131 "Checklist khi tạo feature mới") — cần cập nhật để không hướng dẫn sai cho feature sau này.

## Các bước implement

1. **`src/app/base.dto.ts`**: xoá field `id` khỏi `BaseResponseDto`, giữ `slug`/`createdAt`/`updatedAt`.
2. **Xoá `src/app/base.mapper.ts`** (không còn gì để map sau bước 1).
3. **7 file `<module>.mapper.ts`** ở trên: xoá `import { baseMapper } from 'src/app/base.mapper'` và bỏ đối số `baseMapper()` khỏi lời gọi `createMap(mapper, Entity, ResponseDto, ...)` (nếu `baseMapper()` là đối số duy nhất ngoài 3 tham số bắt buộc, bỏ hẳn dấu phẩy thừa).
4. **`CLAUDE.md`**: sửa dòng 90 (mục "Automapper") bỏ câu nhắc `baseMapper()`, chỉ còn "Entity → ResponseDto map tự động theo tên field trùng khớp (`@AutoMap()` cả 2 phía), không cần cấu hình thêm trừ khi field tên khác nhau (dùng `forMember`)". Sửa dòng 131 (checklist bước 3) tương tự — bỏ `baseMapper()` khỏi hướng dẫn.
5. **Không sửa** `src/user/user.decorator.ts` (`CurrentUserDto`), `src/app/base.entity.ts`, `src/file/file.dto.ts` — theo phạm vi đã chốt.

## File sẽ sửa

```
src/app/base.dto.ts                              (sửa — bỏ field id)
src/app/base.mapper.ts                            (xoá)
src/user/user.mapper.ts                           (sửa — bỏ baseMapper())
src/example/example.mapper.ts                     (sửa)
src/role/role.mapper.ts                           (sửa)
src/authority/authority.mapper.ts                 (sửa)
src/authority-group/authority-group.mapper.ts     (sửa)
src/notification/notification.mapper.ts           (sửa)
src/logger/logger.mapper.ts                       (sửa)
CLAUDE.md                                          (sửa — 2 chỗ nhắc baseMapper())
```

## Verify

1. `npm run lint`, `npm run build` (bắt lỗi import chết/param thừa sau khi xoá `baseMapper()`), `npm run test` — toàn bộ suite hiện có (kể cả `user.service.spec.ts`/`user.controller.spec.ts` vừa viết, đang mock `id` trong response — cần sửa expectation bỏ `id` nếu assert nguyên object).
2. Gọi thử 1 route thật (app đang chạy ở `:8085`) — vd `GET /api/v1/users`, `POST /api/v1/users` — xác nhận response `result`/`result.items[]` không còn field `id`, vẫn có `slug` + field khác đầy đủ.
3. Kiểm tra nhanh 1-2 module khác (vd `GET /api/v1/examples`) để chắc thay đổi áp dụng đúng toàn cục, không chỉ riêng `user`.
