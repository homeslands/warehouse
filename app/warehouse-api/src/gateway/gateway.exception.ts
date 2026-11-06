import { V1FieldError } from 'src/shared/api-v1/envelope';
import { GatewayErrorCodeValue } from './gateway.validation';

/**
 * Lỗi do Gateway v1 tự trả (validation biên, Origin/CSRF, cookie, throttle). Không phải `HttpException`:
 * chỉ `GatewayV1ExceptionFilter` dịch nó sang envelope lỗi v1, route legacy không bao giờ thấy nó.
 */
export class GatewayException extends Error {
  constructor(
    readonly error: GatewayErrorCodeValue,
    readonly fieldErrors: readonly V1FieldError[] = [],
  ) {
    super(error.message);
    this.name = 'GatewayException';
  }
}
