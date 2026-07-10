# warehouse (monorepo)

Không dùng nx/turborepo/lerna/pnpm-workspace — đây chỉ là 1 thư mục `app/` chứa 2 project độc lập, mỗi cái có `package.json`/lockfile riêng, chạy/build/test riêng biệt.

```
app/
├── warehouse-api/   # NestJS 10 + TypeORM/MySQL — backend, xem app/warehouse-api/CLAUDE.md
└── warehouse-ui/    # frontend — hiện chưa có code/CLAUDE.md riêng
```

## Quy tắc chung khi làm việc trong repo này

- Luôn thao tác trong đúng thư mục app (`app/warehouse-api` hoặc `app/warehouse-ui`) — không chạy lệnh npm ở root, root không có `package.json`.
- 2 app không share code, không share `node_modules`, không có pipeline CI/CD hay Docker compose chung — mỗi app tự chứa toàn bộ setup của nó (xem `setup.md`/`CLAUDE.md` trong từng thư mục).
- Khi task chỉ liên quan tới 1 app, ưu tiên đọc/sửa file trong đúng thư mục đó để tránh nạp nhầm ngữ cảnh của app kia.

## Thao tác nhạy cảm — luôn hỏi trước khi chạy

- Bất kỳ lệnh TypeORM nào làm thay đổi schema DB thật (`typeorm:r`, `typeorm:rv`) — đặc biệt `typeorm:rv` (revert) vì khó đảo ngược nếu đã có dữ liệu.
- Sửa/xoá file `.env`, migration đã chạy trong production, hoặc bất kỳ thao tác git destructive (force-push, reset --hard...).
