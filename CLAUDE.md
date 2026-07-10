# warehouse

Monorepo hai phần: `app/warehouse-api` (NestJS) và `app/warehouse-ui` (React 19 + Vite 8).

Đọc file này trước khi làm bất cứ việc gì trong repo. Nó ghi những cái bẫy đã phải trả giá mới biết,
và những khoản nợ kỹ thuật đang còn treo.

---

## Chạy được đã

### warehouse-ui

```bash
cd app/warehouse-ui
nvm use            # BẮT BUỘC — xem mục "Node 24" bên dưới
npm install
cp .env.example .env
npm run dev        # http://localhost:5175
```

| Lệnh | Việc |
|---|---|
| `npm test` | Vitest, chạy một lượt rồi thoát |
| `npm run test:watch` | Chạy lại mỗi khi sửa file |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Build production |
| `npm run gen:api` | Sinh type từ `swagger.json` — **cần backend đang chạy** |

Chạy hết bốn cửa ải trước khi commit:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

### Ba cảnh báo vô hại, đừng "sửa"

- `vite-tsconfig-paths` báo lỗi thời — in ra mỗi lần chạy test.
- `react-refresh/only-export-components` ở `src/components/ui/button.tsx` — mã shadcn sinh ra.
- Build báo chunk lớn hơn 500 kB — đúng, xem mục nợ số 3.

---

## Những cái bẫy

### Node 24, không phải Node 18

`.nvmrc` ghim Node 24. Node 18 làm **vitest chết ngay lúc khởi động**, không chạy nổi một bài test nào:

```
SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'
```

Vite 8 chạy trên rolldown, mà rolldown cần `styleText` (có từ Node 20.12). Triệu chứng trông như test
hỏng, thực ra là sai phiên bản Node. Luôn `nvm use` trước.

### `useTranslation` phải nhận MẢNG namespace

```ts
const { t } = useTranslation(['error'])     // đúng
const { t } = useTranslation('error')       // SAI — t('error:title') không qua được tsc
```

i18next chỉ kiểm tra khoá có tiền tố `ns:` khi namespace truyền dạng mảng. Với chuỗi trần, `tsc` từ chối.

### Cấm `as any` và `as never`

Khoá i18n được kiểm tra kiểu lúc biên dịch. Một cái `as never` để làm `tsc` im lặng sẽ vô hiệu hoá đúng
lớp bảo vệ đó. Nếu `tsc` kêu, **sửa kiểu, đừng ép kiểu**.

### Test chạy bằng tiếng Việt, và điều đó là cố ý

jsdom đặt `navigator.language = 'en-US'`, mà `LanguageDetector` đọc `navigator`. Không ghim thì toàn bộ
test chạy bằng tiếng Anh và các assertion tiếng Việt đỏ hết.

`src/test/setup.ts` có `await i18n.changeLanguage('vi')` — phải là `await`, không phải `void`. Đừng gỡ.

### Mock `matchMedia` cần cả API cũ

`next-themes` gọi `MediaQueryList.addListener` / `removeListener` (API deprecated, trình duyệt thật vẫn
giữ). Mock trong `src/test/setup.ts` phải có cả bốn method, nếu không test đầu tiên render `Providers`
sẽ ném `TypeError: addListener is not a function`.

### Hai namespace i18n gần giống tên nhau

| Namespace | Chứa gì |
|---|---|
| `errors` (số nhiều) | Bản dịch 26 mã lỗi backend, tra qua `src/shared/api/error-codes.ts` |
| `error` (số ít) | Chuỗi của ba trang lỗi: ErrorPage / NotFoundPage / ForbiddenPage |

Cả hai đều typecheck, nên gõ nhầm không ai báo. Đọc kỹ trước khi thêm khoá.

### Đăng nhập sai mật khẩu trả HTTP 401

Backend khai `INVALID_CREDENTIALS` với `HttpStatus.UNAUTHORIZED`. Handler 401 toàn cục ở `src/main.tsx`
thì logout + chuyển trang. Nếu để nó bắt luôn 401 của request đăng nhập, trang sẽ **reload cứng** và
dòng báo lỗi không bao giờ hiện ra.

`src/shared/api/http.ts` miễn trừ đường `LOGIN_PATH` khỏi handler đó. Đừng gỡ. Có test canh
(`http.test.ts`, hai hướng).

---

## Quy ước

**Test khẳng định thứ người dùng THẤY, không phải thứ lập trình viên gõ.**
`ExamplesPage.test.tsx` tìm chữ `/tạo example/i` chứ không tìm khoá `examples:create`.

**Nhưng test của tầng dưới thì assert theo khoá.**
`resolveApiErrorMessage` được so với `i18n.t('errors:exampleNotFound')`, không so với câu tiếng Việt
nguyên văn. Sửa một bản dịch không được phép làm đỏ unit test.

**Dùng token màu, không dùng màu cứng.**
`bg-background`, `text-muted-foreground`, `text-destructive` — chứ không `bg-slate-50`, `text-red-600`.
Màu cứng không đổi theo giao diện tối, và dark mode sẽ chỉ đúng một nửa: khung tối mà thân trắng.

**`can()` là code chết. Dùng `hasRole()`.**
Backend chưa seed authority nào nên `can()` luôn trả `false`. Chỉ `hasRole()` gác thật.

**Không đặt tiền tố `use*` cho hàm không phải React hook.**

**Thêm namespace i18n phải sửa ba chỗ** trong `src/shared/i18n/index.ts`: dòng `import`, object
`resources`, và mảng `ns` trong `.init()`. Quên mảng `ns` thì vẫn typecheck nhưng `t()` trả về khoá thô
lúc chạy. Test key-parity vi/en tự suy danh sách namespace nên nó sẽ canh khoá thiếu.

---

## Nợ kỹ thuật đang treo

Xếp theo mức đau. Chưa có cái nào được làm.

1. **Chưa ai chạy warehouse-ui với backend thật.** Toàn bộ 69 bài test dùng MSW giả lập HTTP. Chúng
   chứng minh code làm đúng thứ nó được viết để làm — không chứng minh nó khớp backend.

2. **Không có CI.** 69 bài test chỉ chạy khi có người nhớ chạy. Cần trước pull request đầu tiên.

3. **Bundle 728 KB trong một cục**, ba màn hình. Chưa lazy-load route, chưa route manifest. Chưa đau,
   sẽ đau khi số màn hình phình lên.

4. **`npm run gen:api` chưa bao giờ chạy.** `src/shared/api/generated.ts` không tồn tại, nên mọi type
   request/response đang **viết tay** trong `src/shared/api/types.ts` và `src/features/*/api.ts`.
   Backend đổi schema thì frontend không biết cho tới lúc chạy.

5. **`POST /auth/refresh` không tồn tại ở backend**, dù `login` vẫn phát ra `refreshToken`.
   Hệ quả: người dùng bị đăng xuất sau 1 tiếng. Đây là việc của `warehouse-api`.

6. **`error-codes.ts` là nguồn chân lý thứ hai.** 26 mã lỗi chép tay từ `*.validation.ts` của backend.
   Thêm mã mới ở backend mà quên khai ở đây thì người dùng thấy câu tiếng Anh nguyên bản (kèm
   `console.warn`). Hỏng có kiểm soát, nhưng vẫn là bản sao thủ công.

7. **Lỗi query không tự báo.** Mỗi mutation gọi `toastApiError` thủ công; `useQuery` thì hiện lỗi inline.
   Chuyển `onError` lên `QueryCache` / `MutationCache` toàn cục sẽ xoá phần lặp này.

8. **`RequireRole()` là code chết.** Được định nghĩa và có test, nhưng không nơi nào dùng.
   Hoặc dùng nó, hoặc xoá nó.

9. **`errorElement` không bắt lỗi trong event handler và code bất đồng bộ.** Giới hạn của React error
   boundary, không phải của react-router. Lỗi ném trong `onClick` vẫn nổi lên `window`.

10. **Không có `ErrorBoundary` bọc `Providers`.** Cố ý: lỗi thiếu `VITE_API_BASE_URL` ném lúc import
    module `http.ts`, trước khi React render dòng nào — không boundary nào bắt được. Thêm lớp đó chỉ
    khi có `Provider` thật sự sập lúc render.
    Xem `docs/superpowers/specs/2026-07-10-warehouse-ui-error-boundary-404-design.md`.

11. **Không gửi lỗi lên dịch vụ giám sát** (Sentry hay tương tự). Chưa có hạ tầng.

12. **Backend còn ba điểm lệch** đã biết: typo `hasPrevios` trong `AppPaginatedResponseDto` (UI cô lập
    nó trong `http.ts`); `AppResponseDto` thiếu `@ApiProperty` nên swagger sinh schema rỗng cho envelope;
    `BaseQueryDto.sort` được quảng cáo trên swagger nhưng `example.service.findAll` bỏ qua.

---

## Tài liệu thiết kế

`docs/superpowers/specs/` ghi **vì sao** các quyết định được chọn — thứ đọc code không đoán ra.
Đọc chúng trước khi định "dọn cho gọn" một đoạn trông thừa.
