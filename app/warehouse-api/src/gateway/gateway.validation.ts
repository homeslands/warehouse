import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/error-code.util';

/**
 * Lỗi do chính Gateway v1 trả (không qua Storage), dải 1183xx (W02 I-02b). HTTP status theo bảng lỗi
 * OpenAPI R2: 400 protocol, 401, 403, 404, 422 field, 429, 500. Message an toàn, cố định.
 */
export interface GatewayErrorCodeValue extends TErrorCodeValue {
  errorKey: string;
}

const code = (
  value: number,
  errorKey: string,
  message: string,
  statusCode: HttpStatus,
): GatewayErrorCodeValue => ({ ...createErrorCode(value, message, statusCode), errorKey });

export const GatewayValidation = {
  GATEWAY_REQUEST_INVALID: code(
    118301,
    'GATEWAY_REQUEST_INVALID',
    'Invalid request',
    HttpStatus.UNPROCESSABLE_ENTITY,
  ),
  GATEWAY_ORIGIN_REJECTED: code(
    118302,
    'GATEWAY_ORIGIN_REJECTED',
    'Origin is not allowed',
    HttpStatus.FORBIDDEN,
  ),
  GATEWAY_CSRF_INVALID: code(
    118303,
    'GATEWAY_CSRF_INVALID',
    'CSRF token is missing or invalid',
    HttpStatus.FORBIDDEN,
  ),
  GATEWAY_REFRESH_COOKIE_MISSING: code(
    118304,
    'GATEWAY_REFRESH_COOKIE_MISSING',
    'Authentication required',
    HttpStatus.UNAUTHORIZED,
  ),
  GATEWAY_RATE_LIMITED: code(
    118305,
    'GATEWAY_RATE_LIMITED',
    'Too many requests, please try again later',
    HttpStatus.TOO_MANY_REQUESTS,
  ),
  GATEWAY_ROUTE_NOT_FOUND: code(
    118306,
    'GATEWAY_ROUTE_NOT_FOUND',
    'Resource not found',
    HttpStatus.NOT_FOUND,
  ),
  GATEWAY_INTERNAL: code(
    118307,
    'GATEWAY_INTERNAL',
    'Internal error',
    HttpStatus.INTERNAL_SERVER_ERROR,
  ),
  GATEWAY_PAYLOAD_INVALID: code(
    118308,
    'GATEWAY_PAYLOAD_INVALID',
    'Invalid request payload',
    HttpStatus.BAD_REQUEST,
  ),
  GATEWAY_CLIENT_IP_UNAVAILABLE: code(
    118309,
    'GATEWAY_CLIENT_IP_UNAVAILABLE',
    'Service temporarily unavailable',
    HttpStatus.SERVICE_UNAVAILABLE,
  ),
  GATEWAY_REFRESH_COOKIE_CONFLICT: code(
    118310,
    'GATEWAY_REFRESH_COOKIE_CONFLICT',
    'Authentication required',
    HttpStatus.UNAUTHORIZED,
  ),
} as const satisfies Record<string, GatewayErrorCodeValue>;

/** `FieldError.errorKey` cho lỗi validation ở biên Gateway (ngoài các key `SESSION_*` dùng chung với Storage). */
export const GatewayFieldErrorKey = {
  PROPERTY_NOT_ALLOWED: 'GATEWAY_PROPERTY_NOT_ALLOWED',
  VALUE_INVALID: 'GATEWAY_VALUE_INVALID',
} as const;
