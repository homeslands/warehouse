import { ServiceDefinition } from '@grpc/grpc-js';
import { PackageDefinition } from '@grpc/proto-loader';
import { loadStorageProto, STORAGE_SERVICE } from 'src/shared/grpc/storage-proto';

let cachedStorageProto: PackageDefinition | undefined;

/**
 * Bản nạp proto R2 dùng chung trong tiến trình cho server/client/enum adapter (proto ~4.4k dòng, nạp 1 lần).
 * Dùng nguyên `loadStorageProto()` của I-01a (không đổi options loader). Chỉ đọc; không sửa object trả về.
 */
export function getStorageProto(): PackageDefinition {
  cachedStorageProto ??= loadStorageProto();
  return cachedStorageProto;
}

/** Service `WarehouseStorage` (serialize/deserialize theo `STORAGE_PROTO_LOADER_OPTIONS`). */
export function getStorageServiceDefinition(): ServiceDefinition {
  return getStorageProto()[STORAGE_SERVICE] as ServiceDefinition;
}
