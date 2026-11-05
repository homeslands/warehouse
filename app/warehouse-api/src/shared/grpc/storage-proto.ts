import { dirname, join } from 'path';
import { loadSync, Options, PackageDefinition } from '@grpc/proto-loader';

/**
 * Contract gRPC Gateway ↔ Storage (W02, D03). Bản sao byte-đúng của
 * `docs/project/baseline/contracts/warehouse-storage.proto` (R2), được khoá bằng
 * `storage-proto.spec.ts`. Không sửa tay: thay đổi contract phải qua CR/revision R2.
 *
 * Đường dẫn tính từ thư mục file này, nên chạy được cả từ `src/` (ts-jest) lẫn `dist/` (nest build):
 * `<app>/src/shared/grpc` và `<app>/dist/shared/grpc` đều lùi 3 cấp về `<app>`.
 */
export const STORAGE_PROTO_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'proto',
  'warehouse-storage.proto',
);
export const STORAGE_PACKAGE = 'warehouse.storage.v1';
export const STORAGE_SERVICE = `${STORAGE_PACKAGE}.WarehouseStorage`;

/**
 * Tuỳ chọn proto-loader dùng chung cho server Storage và client Gateway, để 2 phía decode giống nhau.
 * - `longs: String`: int64 (vd `expected_version`) không mất chính xác qua JS number.
 * - `enums: String`: enum đi dây dạng tên, khớp OpenAPI.
 * - `defaults: false` + `oneofs: true`: giữ phân biệt "không gửi" với "gửi giá trị rỗng" (FieldMask/clear_fields).
 * - `keepCase: false`: field camelCase theo `json_name` của proto.
 */
export const STORAGE_PROTO_LOADER_OPTIONS: Readonly<Options> = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: false,
  oneofs: true,
  includeDirs: [dirname(STORAGE_PROTO_PATH)],
};

export function loadStorageProto(): PackageDefinition {
  return loadSync(STORAGE_PROTO_PATH, STORAGE_PROTO_LOADER_OPTIONS);
}

/** Tên RPC tương ứng operationId OpenAPI R2: `listOwnSessions` → `ListOwnSessions`. */
export function rpcNameForOperation(operationId: string): string {
  return operationId.charAt(0).toUpperCase() + operationId.slice(1);
}
