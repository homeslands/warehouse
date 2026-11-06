import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';

/** Lý do Gateway tự từ chối gửi RPC (lỗi input client), khác lỗi do Storage trả. */
export type StorageRpcGatewayReason = 'GATEWAY_AUTHORIZATION_MALFORMED';

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
    /** Có giá trị ⇒ RPC không được gửi; Gateway từ chối trước (vd header Authorization sai định dạng). */
    readonly gatewayReason?: StorageRpcGatewayReason,
  ) {
    super(
      gatewayReason
        ? `Storage RPC ${rpc} not sent: ${gatewayReason}`
        : `Storage RPC ${rpc} failed with ${GrpcStatus[grpcCode] ?? grpcCode}`,
    );
    this.name = 'StorageRpcError';
  }
}
