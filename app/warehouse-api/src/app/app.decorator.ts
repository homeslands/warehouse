import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { AppPaginatedResponseDto, AppResponseDto } from './app.dto';

interface ApiResponseWithTypeOptions {
  status: HttpStatus;
  description?: string;
  type: Type<unknown>;
  isArray?: boolean;
}

export function ApiResponseWithType(options: ApiResponseWithTypeOptions) {
  const { status, description, type, isArray } = options;

  return applyDecorators(
    ApiExtraModels(AppResponseDto, type),
    ApiResponse({
      status,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(AppResponseDto) },
          {
            properties: {
              result: isArray
                ? { type: 'array', items: { $ref: getSchemaPath(type) } }
                : { $ref: getSchemaPath(type) },
            },
          },
        ],
      },
    }),
  );
}

export function ApiPaginatedResponse(type: Type<unknown>, description?: string) {
  return applyDecorators(
    ApiExtraModels(AppResponseDto, AppPaginatedResponseDto, type),
    ApiResponse({
      status: HttpStatus.OK,
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(AppResponseDto) },
          {
            properties: {
              result: {
                allOf: [
                  { $ref: getSchemaPath(AppPaginatedResponseDto) },
                  {
                    properties: {
                      items: { type: 'array', items: { $ref: getSchemaPath(type) } },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    }),
  );
}
