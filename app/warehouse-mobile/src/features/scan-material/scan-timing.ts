/**
 * Ngưỡng "giữ yên mới nhận" của camera quét (`BarcodeCamera`). Là object có thể ghi để test chỉnh:
 * `jest.setup-after-env.ts` đặt `dwellMs = 0` và `repeatHintMs = 0` (một lần đọc là nhận / báo lặp ngay —
 * các test màn hình bắn từng sự kiện quét)
 * — test riêng của luật giữ yên tự đặt lại giá trị thật. Code sản phẩm KHÔNG được ghi vào đây.
 */
export const scanTiming = {
  /** Mã phải được thấy trong khung liên tục ít nhất khoảng này mới được nhận (lướt qua khi đưa máy lên thì không). */
  dwellMs: 350,
  /**
   * Không thấy mã quá khoảng này → coi như đã rời khung, đếm giữ yên lại từ đầu. Đủ rộng cho nhịp đọc thưa
   * của Android (ML Kit trả kết quả vài lần mỗi giây).
   */
  gapMs: 600,
  /**
   * Quét liên tục: nhãn vừa được nhận mà VẪN nằm trong khung — chỉ báo `onRepeat` khi đã quá khoảng này kể
   * từ lần nhận (người dùng có vẻ đang chờ cộng thêm). Ngay sau khi nhận tay thường chưa kịp rời nhãn,
   * báo lúc đó trông như lỗi.
   */
  repeatHintMs: 1500,
}

/** Giá trị gốc (để test khôi phục sau khi chỉnh). */
export const DEFAULT_SCAN_TIMING = { dwellMs: 350, gapMs: 600, repeatHintMs: 1500 } as const
