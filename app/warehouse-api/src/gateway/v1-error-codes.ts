import { AppValidation } from 'src/app/app.validation';
import { TErrorCodeValue } from 'src/app/error-code.util';
import {
  StorageRpcSpecialValidation,
  StorageRpcValidation,
} from 'src/grpc/gateway/storage-rpc.validation';
import { SessionValidation } from 'src/session/session.validation';
import { RbacValidation } from 'src/rbac-v1/rbac-v1.validation';
import { GatewayValidation } from './gateway.validation';

/**
 * DEV-197-04 (I-02b): các dải mã v1 (1180xx fallback RPC, 1181xx đặc biệt, 1182xx phiên, 1183xx Gateway)
 * không nằm trong `AppValidation` (legacy) nên guard trùng mã ở `app.validation.ts` không phủ chúng. Thay vì
 * sửa `src/app/` (đổi kiểu/hành vi legacy), guard này gộp các dải v1 VÀ mọi mã legacy vào 1 bảng, kiểm:
 * - không trùng `code` (số) giữa bất kỳ 2 mục nào, kể cả v1 ↔ legacy;
 * - không trùng tên key giữa các dải v1 với nhau và với legacy (errorKey trả ra client là duy nhất).
 * Chạy lúc nạp module Gateway (trùng ⇒ Gateway không khởi động được) và trong unit test.
 */
export const V1_ERROR_CODE_REGISTRIES: Readonly<
  Record<string, Readonly<Record<string, TErrorCodeValue>>>
> = {
  StorageRpcValidation,
  StorageRpcSpecialValidation,
  SessionValidation,
  RbacValidation,
  GatewayValidation,
};

export class DuplicateErrorCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateErrorCodeError';
  }
}

export function assertUniqueErrorCodes(
  registries: Readonly<Record<string, Readonly<Record<string, TErrorCodeValue>>>>,
  legacy: Readonly<Record<string, TErrorCodeValue>> = AppValidation,
): number {
  const codes = new Map<number, string>();
  const keys = new Map<string, string>();
  const claim = (owner: string, key: string, value: TErrorCodeValue) => {
    const codeOwner = codes.get(value.code);
    if (codeOwner)
      throw new DuplicateErrorCodeError(
        `duplicate error code ${value.code}: ${codeOwner} / ${owner}.${key}`,
      );
    codes.set(value.code, `${owner}.${key}`);
    const keyOwner = keys.get(key);
    if (keyOwner)
      throw new DuplicateErrorCodeError(`duplicate error key ${key}: ${keyOwner} / ${owner}`);
    keys.set(key, owner);
  };
  for (const [key, value] of Object.entries(legacy)) claim('AppValidation', key, value);
  for (const [owner, registry] of Object.entries(registries))
    for (const [key, value] of Object.entries(registry)) claim(owner, key, value);
  return codes.size;
}

/** Guard lúc nạp module (giống guard của `AppValidation`). */
assertUniqueErrorCodes(V1_ERROR_CODE_REGISTRIES);
