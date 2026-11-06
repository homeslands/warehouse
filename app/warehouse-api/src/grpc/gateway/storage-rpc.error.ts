import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';

/**
 * Lỗi một RPC Gateway → Storage. Giữ gRPC status, trailing metadata (để đọc detail đã validate) và traceId
 * của request. `message` chỉ chứa tên RPC + tên status — không chép `details` của server (có thể là
 * message nội bộ) và không chứa metadata `authorization`.
 */
export class StorageRpcError extends Error {
  constructor(
    readonly rpc: string,
    readonly grpcCode: GrpcStatus,
    readonly traceId: string,
    readonly trailers: Metadata,
  ) {
    super(`Storage RPC ${rpc} failed with ${GrpcStatus[grpcCode] ?? grpcCode}`);
    this.name = 'StorageRpcError';
  }
}
