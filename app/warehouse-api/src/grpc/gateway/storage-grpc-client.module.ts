import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_GRPC_CONFIG_KEYS } from '../grpc.constants';
import { loadMtlsMaterial } from '../mtls/mtls-credentials';
import { StorageGrpcClient, StorageGrpcClientConfig } from './storage-grpc.client';
import { StorageRpcErrorFilter } from './storage-rpc-error.filter';

/** Đọc cấu hình client từ ConfigService (BE-ARCH-04). Thiếu biến ⇒ lỗi khi khởi tạo module. */
export function readStorageGrpcClientConfig(config: ConfigService): StorageGrpcClientConfig {
  const keys = STORAGE_GRPC_CONFIG_KEYS;
  return {
    address: config.getOrThrow<string>(keys.address),
    serverName: config.getOrThrow<string>(keys.serverName),
    tls: loadMtlsMaterial({
      caPath: config.getOrThrow<string>(keys.caPath),
      certPath: config.getOrThrow<string>(keys.certPath),
      keyPath: config.getOrThrow<string>(keys.keyPath),
    }),
    deadlineMs: Number(config.getOrThrow<string | number>(keys.deadlineMs)),
  };
}

/**
 * Module client Storage cho composition root Gateway. I-01b không import module này vào `AppModule`
 * (legacy giữ nguyên); Gateway v1 (I-02+) import `StorageGrpcClientModule.forRoot()`.
 */
@Module({})
export class StorageGrpcClientModule {
  static forRoot(): DynamicModule {
    return {
      module: StorageGrpcClientModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: StorageGrpcClient,
          inject: [ConfigService],
          useFactory: (config: ConfigService) =>
            new StorageGrpcClient(readStorageGrpcClientConfig(config)),
        },
        StorageRpcErrorFilter,
      ],
      exports: [StorageGrpcClient, StorageRpcErrorFilter],
    };
  }
}
