# Cài đặt warehouse-ui

## Yêu cầu

- Node 24 — `nvm use` (đọc `.nvmrc`). Node cũ hơn làm Vitest chết lúc khởi động.
- `warehouse-api` chạy ở `http://localhost:8085`, hoặc trỏ `VITE_API_PROXY_TARGET` tới sandbox.

## Các bước

```bash
cd app/warehouse-ui
nvm use
npm install
cp .env.example .env
npm run dev
```

Mở http://localhost:5175 — cổng này cố định (`strictPort: true`) vì phải khớp `ALLOWED_ORIGINS`
của backend. Để Vite tự nhảy cổng khác thì lỗi sẽ hoá trang thành lỗi CORS khó truy. Khi dùng proxy
(mặc định) CORS không còn liên quan, nhưng giữ cổng cố định cho người gọi thẳng.

## Biến môi trường

| Biến | Ý nghĩa |
|---|---|
| `VITE_API_BASE_URL` | Gốc API. `/api/v1` (qua proxy) hoặc URL đầy đủ `https://<host>/api/v1` (gọi thẳng). |
| `VITE_API_PROXY_TARGET` | Chỉ dùng cho `npm run dev` / `npm run preview`: server backend mà `/api` được chuyển tới. |

Mặc định `.env.example` dùng proxy: trình duyệt gọi `localhost:5175/api/v1/...`, Vite chuyển tới
`VITE_API_PROXY_TARGET`. Không phụ thuộc `ALLOWED_ORIGINS` của backend, nên `npm run preview` (cổng 4173)
cũng chạy được. Muốn dùng sandbox: `VITE_API_PROXY_TARGET=https://sandbox.warehouse.cmsiot.net`.

`VITE_API_BASE_URL` tương đối mà thiếu `VITE_API_PROXY_TARGET` thì `npm run dev` và `npm run preview`
dừng ngay với thông báo nêu tên biến. `npm run build` thì không: bản build với base tương đối là hợp lệ
khi đặt sau reverse proxy (xem dưới).

**Proxy không tồn tại ở bản build production.** Image production phải build với `VITE_API_BASE_URL` là
URL đầy đủ, hoặc đặt sau reverse proxy chuyển `/api` về backend trên cùng domain.

Thiếu `VITE_API_BASE_URL` thì app hiện trang lỗi nêu tên biến (không phải màn hình trắng).

**Đừng copy `.env` từ project khác.** Vite nhét mọi biến `VITE_*` vào bundle JavaScript công khai —
ai mở DevTools cũng đọc được. Chỉ để trong `.env` những biến warehouse-ui thật sự dùng.

## Tài khoản thử

Backend tự seed root user: `root` / `root`, role `SUPER_ADMIN`.
Đăng nhập bằng **phonenumber**, không phải email.

## Kiểm tra cài đặt đúng

```bash
npm run check
```

`check` chạy lần lượt lint, typecheck, test:coverage, build, format:check. Tất cả phải xanh (`lint` sẽ báo đúng 1 warning có sẵn, không phải lỗi — xem `CLAUDE.md`).
