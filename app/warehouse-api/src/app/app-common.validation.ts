import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from './app.validation';

export const DATA_VERSION_CONFLICT = 'DATA_VERSION_CONFLICT';

export type TAppCommonErrorCodeKey = typeof DATA_VERSION_CONFLICT;

export type TAppCommonErrorCode = Record<TAppCommonErrorCodeKey, TErrorCodeValue>;

// 100800 - 100900: mã lỗi dùng chung, không thuộc riêng module nào
export const AppCommonValidation: TAppCommonErrorCode = {
  DATA_VERSION_CONFLICT: createErrorCode(
    100800,
    'Data has been modified by another request, please reload and try again',
    HttpStatus.CONFLICT,
  ),
};
