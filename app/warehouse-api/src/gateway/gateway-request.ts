import { createParamDecorator, ExecutionContext, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { isIP } from 'net';
import { normalizeTraceId } from 'src/shared/api-v1/trace-id';

/**
 * Ngữ cảnh 1 request HTTP v1 ở Gateway: traceId (UUID mới cho mỗi request — OpenAPI không có header trace
 * phía client, Q-trace-HTTP), IP client (theo Express `trust proxy` đã cấu hình), User-Agent.
 */
export interface GatewayRequestContext {
  traceId: string;
  /** `undefined` khi không xác định được IP hợp lệ — login sẽ bị 503 (review I-02a L1). */
  ip?: string;
  userAgent?: string;
}

const CONTEXT_KEY = Symbol('gatewayV1Context');
type ContextCarrier = Request & { [CONTEXT_KEY]?: GatewayRequestContext };
const IPV4_MAPPED_PREFIX = '::ffff:';

/** `::ffff:127.0.0.1` → `127.0.0.1`; không phải IP ⇒ `undefined`. */
export function normalizeClientIp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)
    ? raw.slice(IPV4_MAPPED_PREFIX.length)
    : raw;
  // IPv6 có zone (`fe80::1%eth0`) bị loại: không gửi được qua metadata `x-client-ip` và không định danh client.
  return isIP(value) && !value.includes('%') ? value : undefined;
}

export function requestContext(request: Request): GatewayRequestContext {
  const carrier = request as ContextCarrier;
  carrier[CONTEXT_KEY] ??= {
    traceId: normalizeTraceId(undefined),
    // `request.ip` tôn trọng `trust proxy`: không cấu hình ⇒ địa chỉ socket, không đọc X-Forwarded-For.
    ip: normalizeClientIp(request.ip),
    userAgent: request.get('user-agent') ?? undefined,
  };
  return carrier[CONTEXT_KEY];
}

/** Gắn ngữ cảnh ngay đầu pipeline để filter lỗi (kể cả 404/JSON hỏng) dùng cùng traceId. */
@Injectable()
export class GatewayRequestContextMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    requestContext(request);
    next();
  }
}

/** `@GatewayContext()` — ngữ cảnh request đã gắn bởi middleware. */
export const GatewayContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GatewayRequestContext =>
    requestContext(context.switchToHttp().getRequest<Request>()),
);
