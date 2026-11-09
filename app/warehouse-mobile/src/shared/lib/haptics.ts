import * as Haptics from 'expo-haptics'

// Rung chỉ là phản hồi phụ: máy không hỗ trợ / tắt rung thì bỏ qua, không làm hỏng thao tác chính.
const ignore = () => undefined

/** Phản hồi rung dùng chung (expo-haptics). Gọi kiểu "bắn rồi quên". */
export const haptics = {
  /** Đổi lựa chọn (đánh dấu một mục khác). */
  selection: () => void Haptics.selectionAsync().catch(ignore),
  success: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(ignore),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(ignore),
}
