import { RateLimitRule } from 'src/session/session.constants';

/** Prefix HTTP của Gateway v1 (OpenAPI R2 server `/api/v1`). Trùng chữ với prefix legacy `api/${VERSION}` ⇒
 * Gateway là process/composition root riêng, KHÔNG gắn vào `AppModule`. */
export const GATEWAY_V1_PREFIX = 'api/v1';

export const GATEWAY_CONFIG = Symbol('GATEWAY_CONFIG');
export const GATEWAY_CLOCK = Symbol('GATEWAY_CLOCK');

/**
 * Throttle refresh theo IP ở Gateway (I-02b, review I-02a Info). R2 chỉ có 30/phút/PHIÊN (Storage); con số
 * theo IP là tạm (DEV-197-16): 60/phút/IP, đủ cho vài tab/thiết bị sau 1 NAT, chặn quét cookie rác.
 */
export const REFRESH_IP_RATE_LIMIT: RateLimitRule = { limit: 60, windowMs: 60_000 };

/** Header CSRF của `refresh` (OpenAPI R2, minLength 16). */
export const CSRF_HEADER = 'x-csrf-token';
