import { Injectable, PipeTransform, ValidationError, ValidationPipeOptions } from '@nestjs/common';
import { validate as uuidValidate } from 'uuid';
import { V1FieldError } from 'src/shared/api-v1/envelope';
import { SessionFieldErrorKey } from 'src/session/session.validation';
import { GatewayException } from './gateway.exception';
import { GatewayFieldErrorKey, GatewayValidation } from './gateway.validation';

const SAFE_FIELD = /^[A-Za-z0-9_.]{1,64}$/;
const ERROR_KEY = /^[A-Z][A-Z0-9_]{0,127}$/;
const WHITELIST_CONSTRAINT = 'whitelistValidation';
const MAX_FIELD_ERRORS = 50;

/** Tên field do client gửi (field lạ) có thể là chuỗi tuỳ ý ⇒ chỉ phản hồi tên an toàn. */
const fieldName = (property: string) => (SAFE_FIELD.test(property) ? property : '(unknown)');

function toFieldErrors(errors: ValidationError[], parent = ''): V1FieldError[] {
  return errors.flatMap((error) => {
    const field = fieldName(parent ? `${parent}.${error.property}` : error.property);
    const nested = error.children?.length ? toFieldErrors(error.children, field) : [];
    const constraints = Object.entries(error.constraints ?? {});
    if (!constraints.length) return nested;
    const [name, message] = constraints[0];
    if (name === WHITELIST_CONSTRAINT)
      return [
        {
          field,
          errorKey: GatewayFieldErrorKey.PROPERTY_NOT_ALLOWED,
          message: 'Property is not allowed',
        },
      ];
    const errorKey = ERROR_KEY.test(message) ? message : GatewayFieldErrorKey.VALUE_INVALID;
    return [{ field, errorKey, message: `${field} is invalid` }, ...nested];
  });
}

/**
 * Tuỳ chọn `ValidationPipe` cho mọi `@Body/@Query` v1 (BE-DTO-01): `transform` + `whitelist`, và
 * `forbidNonWhitelisted` vì schema OpenAPI R2 là `additionalProperties: false`. Lỗi ⇒ 422 envelope v1
 * (`GATEWAY_REQUEST_INVALID` + field errors), không đi qua filter legacy.
 */
export const V1_VALIDATION_OPTIONS: ValidationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  stopAtFirstError: true,
  exceptionFactory: (errors: ValidationError[]) =>
    new GatewayException(
      GatewayValidation.GATEWAY_REQUEST_INVALID,
      toFieldErrors(errors).slice(0, MAX_FIELD_ERRORS),
    ),
};

/** Path param `{id}` format uuid (OpenAPI) ⇒ 422 field `id` nếu sai, trước khi gọi Storage. */
@Injectable()
export class V1UuidPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !uuidValidate(value))
      throw new GatewayException(GatewayValidation.GATEWAY_REQUEST_INVALID, [
        {
          field: 'id',
          errorKey: SessionFieldErrorKey.SESSION_ID_INVALID,
          message: 'id must be a UUID',
        },
      ]);
    return value.toLowerCase();
  }
}
