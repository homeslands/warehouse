/**
 * Lối rời BẮT BUỘC (đích đổi khi đang mở sheet — `useLeaveSheetOnSessionChange`) không bao giờ bị chặn
 * bởi `useDiscardGuard`. Mỗi guard đang gắn đăng ký một hàm "nhả"; nơi rời bắt buộc gọi
 * `releaseLeaveGuards()` NGAY TRƯỚC khi điều hướng, trong cùng lượt — guard tắt chặn (không hỏi), hộp
 * hỏi đang mở (nếu có) bị bỏ qua khi người dùng trả lời (không chạy lại action cũ trên state mới).
 */
const guards = new Set<() => void>()

/** Đăng ký hàm nhả của một guard; trả hàm huỷ đăng ký. */
export function registerLeaveGuard(release: () => void): () => void {
  guards.add(release)
  return () => {
    guards.delete(release)
  }
}

/** Nhả mọi guard đang gắn. Gọi ngay trước `router.*` của lần rời bắt buộc. */
export function releaseLeaveGuards(): void {
  for (const release of [...guards]) release()
}
