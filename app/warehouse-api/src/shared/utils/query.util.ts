import { And, FindOperator, LessThan, MoreThanOrEqual } from 'typeorm';

/**
 * Chuỗi tìm kiếm dạng văn bản: chỉ chữ cái (gồm tiếng Việt có dấu — `\p{L}` khớp cả dạng dựng sẵn
 * lẫn tổ hợp nhờ `\p{M}`), chữ số và khoảng trắng; từ chối ký tự đặc biệt như `@ # , % _`. Dùng với
 * `@Matches(SEARCH_TEXT_REGEX, { message: '<MODULE>_..._INVALID' })` trong DTO.
 */
export const SEARCH_TEXT_REGEX = /^[\p{L}\p{M}\p{N}\s]+$/u;

/**
 * Chuỗi tìm kiếm theo mã nghiệp vụ: chỉ chữ IN HOA, chữ số, `_` và `-`. Field phải `@Transform`
 * về chữ hoa TRƯỚC (`@Transform` chạy trước validator) để client gửi `mat-` vẫn hợp lệ. `_` là ký tự
 * đại diện của `LIKE` ⇒ vẫn phải qua `escapeLike` khi tìm.
 */
export const SEARCH_CODE_REGEX = /^[A-Z0-9_-]+$/;

/**
 * Escape ký tự đại diện của `LIKE` (`%`, `_`) và ký tự escape mặc định của MySQL (`\`) — để chuỗi
 * client gửi được so khớp theo nghĩa đen, `?code=A_` không khớp luôn `AB`.
 */
export const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * `YYYY-MM-DD` = trọn ngày theo giờ server: `startDate` từ 00:00, `endDate` tới hết ngày (so sánh
 * `< 00:00 ngày kế`). ISO 8601 đầy đủ thì dùng nguyên mốc, `endDate` vẫn bao gồm (`end` là mốc
 * loại trừ, dùng với `LessThan`). Không tự kiểm `start < end` — caller ném mã lỗi riêng của module.
 */
export const resolveDateRange = (
  startDate?: string,
  endDate?: string,
): { start?: Date; end?: Date } => {
  const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const toLocalMidnight = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  let start: Date | undefined;
  let end: Date | undefined;
  if (startDate) start = isDateOnly(startDate) ? toLocalMidnight(startDate) : new Date(startDate);
  if (endDate) {
    if (isDateOnly(endDate)) {
      end = toLocalMidnight(endDate);
      end.setDate(end.getDate() + 1);
    } else {
      end = new Date(new Date(endDate).getTime() + 1);
    }
  }
  return { start, end };
};

/**
 * Điều kiện `where` cho cột thời gian từ kết quả `resolveDateRange()`: `start` bao gồm, `end` loại
 * trừ. Không có mốc nào ⇒ `undefined` (caller bỏ qua, không gán vào `where`).
 */
export const toDateRangeOperator = (start?: Date, end?: Date): FindOperator<Date> | undefined => {
  if (start && end) return And(MoreThanOrEqual(start), LessThan(end));
  if (start) return MoreThanOrEqual(start);
  if (end) return LessThan(end);
  return undefined;
};
