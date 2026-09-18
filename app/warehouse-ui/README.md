# warehouse-ui

Frontend cho hệ thống quản lý kho. React 19 + Vite 8 + TypeScript.

## Yêu cầu

- Node 24 (`.nvmrc`). Node cũ hơn làm Vitest chết lúc khởi động.
- `warehouse-api` chạy ở `http://localhost:8085`.

## Chạy

```bash
nvm use
npm install
cp .env.example .env
npm run dev
```

Mở http://localhost:5175

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier, chỉ kiểm tra |
| `npm run test:coverage` | Vitest kèm coverage — ngưỡng ở `coverage.thresholds` trong `vite.config.ts` là sàn chặn tụt lùi, chỉ nâng, không hạ |
| `npm run build` | Build production |
| `npm run check` | Chạy đủ lint → typecheck → test:coverage → build → format:check, dừng ở bước lỗi đầu tiên. **Chạy trước khi push.** |

## Kiến trúc

Feature-Sliced Design, sáu tầng, chiều import một chiều:

`app → pages → widgets → features → entities → shared`

ESLint giữ luật (`boundaries/dependencies`, `boundaries/entry-point`). Chi tiết ở `CLAUDE.md`.

## Đa ngôn ngữ

Tiếng Việt (mặc định) và tiếng Anh. Bản dịch ở `src/shared/i18n/locales/<lng>/<namespace>.json`.
Khoá được kiểm tra kiểu lúc biên dịch — gõ sai khoá thì `npm run typecheck` báo lỗi.

Lỗi từ backend trả về mã số; `src/shared/api/error-codes.ts` ánh xạ mã đó sang khoá i18n.
Thêm mã lỗi mới ở backend thì phải thêm vào file này, nếu không người dùng sẽ thấy
câu tiếng Anh nguyên bản của backend (và một cảnh báo trong console).

## Giao diện sáng/tối

`next-themes`, điều khiển bằng class trên `<html>`. Token màu ở `src/app/styles/index.css`.
Dùng token (`bg-background`, `text-muted-foreground`, ...) thay vì màu cứng (`bg-slate-50`),
nếu không dark mode sẽ chỉ đúng một nửa.
