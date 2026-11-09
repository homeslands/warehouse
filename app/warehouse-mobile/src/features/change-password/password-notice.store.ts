import { create } from 'zustand'

type PasswordNoticeState = {
  /** Vừa đổi mật khẩu thành công: màn Tài khoản hiện câu "Đã đổi mật khẩu…" dưới nhóm Cài đặt. */
  changed: boolean
  show: () => void
  clear: () => void
}

/**
 * Cầu nối nhỏ giữa sheet đổi mật khẩu (route riêng, đóng xong là unmount) và màn Tài khoản. Xoá khi
 * mở lại sheet hoặc khi phiên kết thúc (session-wiring).
 */
export const usePasswordNotice = create<PasswordNoticeState>((set) => ({
  changed: false,
  show: () => set({ changed: true }),
  clear: () => set({ changed: false }),
}))
