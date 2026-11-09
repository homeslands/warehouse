import { Easing } from 'react-native-reanimated'

/**
 * Thông số chuyển động dùng chung. Mọi animation phải tôn trọng Reduce Motion: đọc
 * `useReducedMotion()` của reanimated và khi bật thì bỏ scale/nảy/lắc, chỉ đổi tức thì hoặc mờ dần.
 */
export const motion = {
  /** Đổi trạng thái chọn (màu nền, viền, ô icon, radio). */
  select: 220,
  /** Chuyển nội dung sau khi đổi kho (chữ viên kho, mờ nội dung tab). */
  content: 250,
  /** Gỡ một thẻ khỏi danh sách: thẻ trượt ra trái trong `rowExit`, XONG mới tới thẻ dưới trượt lên lấp chỗ
   *  (`rowFill`, chờ `rowExit`). */
  rowExit: 220,
  rowFill: 260,
  easeOut: Easing.out(Easing.cubic),
} as const
