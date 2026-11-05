import { AppPaginatedResponseDto } from 'src/app/app.dto';

/** Phần query phân trang mà helper cần — `BaseQueryDto` đã chặn `page`, `size` ≥ 1. */
export interface PageQuery {
  page: number;
  size: number;
}

/**
 * Dựng `AppPaginatedResponseDto` cho mọi endpoint danh sách — 1 nguồn duy nhất cho công thức
 * `totalPages`/`hasNext`/`hasPrevios`, đừng tự dựng object ở service.
 *
 * `hasPrevios` sai chính tả nhưng là field client đang dùng — giữ nguyên (xem `app.dto.ts`).
 */
export function toPaginatedResponse<T>(
  items: T[],
  total: number,
  query: PageQuery,
): AppPaginatedResponseDto<T> {
  const totalPages = Math.ceil(total / query.size);
  return {
    items,
    total,
    page: query.page,
    pageSize: query.size,
    totalPages,
    hasNext: query.page < totalPages,
    hasPrevios: query.page > 1,
  };
}
