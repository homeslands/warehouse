import type { UserEvent } from '@testing-library/user-event'

/**
 * Nhập nguyên chuỗi vào ô như người dùng dán: bấm vào ô (focus, con trỏ ở cuối giá trị sẵn có) rồi dán MỘT lần.
 *
 * Dùng cho bước NHẬP DỮ LIỆU của kịch bản nhiều bước khi test không kiểm hành vi từng phím. `user.type` bắn
 * keydown/keypress/input/keyup cho từng ký tự và mỗi ký tự là một lần vẽ lại cả sheet phiếu (sheet theo dõi
 * giá trị form): đo ở #163 ~85–105ms mỗi ký tự khi chạy coverage, nên vài ô ngắn đã tốn cả giây và đẩy test
 * tích hợp sát timeout 5s. Kiểm phím (Enter, định dạng trong lúc gõ, con trỏ...) thì vẫn dùng `user.type`.
 */
export async function fillText(user: UserEvent, element: Element, text: string) {
  await user.click(element)
  await user.paste(text)
}
