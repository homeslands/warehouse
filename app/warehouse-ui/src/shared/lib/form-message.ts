import i18n from '@/shared/i18n'

// Khoá i18n của dự án luôn có namespace: `examples:nameRequired`, `auth:changePassword.mismatch`.
// Message backend đã dịch ("Tên example đã tồn tại") hay câu tiếng Anh của backend không khớp mẫu.
const I18N_KEY = /^[A-Za-z][\w-]*:[\w.-]+$/

/**
 * Message lỗi của form có hai loại: khoá i18n (schema Zod khai sẵn) và chuỗi đã dịch
 * (`applyApiErrorToForm` đưa lỗi backend vào). Chỉ dịch khi đúng dạng `namespace:key` VÀ khoá tồn
 * tại — nếu không hiện nguyên, để không bao giờ biến câu đã dịch thành chuỗi khoá vô nghĩa.
 */
export function translateFormMessage(message: string): string {
  if (!I18N_KEY.test(message) || !i18n.exists(message)) return message
  // Khoá động (không biết lúc biên dịch) nên phải bỏ kiểu khoá chặt của i18next.
  return (i18n.t as unknown as (key: string) => string)(message)
}
