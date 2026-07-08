import { HttpStatus } from '@nestjs/common';

export class AppResponseDto<T> {
  message: string;
  statusCode: HttpStatus;
  timestamp: string;
  method?: string;
  path?: string;
  result?: T;
}

export class AppPaginatedResponseDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevios: boolean;
}
