import { useEffect } from 'react'
import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form'

/**
 * Mọi form dùng `mode: 'onTouched'`: một ô được kiểm khi rời ô lần đầu, sau đó kiểm lại mỗi lần gõ —
 * lỗi hiện ngay khi nhập xong, không đợi bấm Lưu; cũng không la lỗi khi người dùng mới gõ chữ đầu.
 *
 * Nhưng RHF chỉ kiểm lại ĐÚNG ô đang gõ. Luật nối hai ô (vd "Nhập lại mật khẩu" phải khớp "Mật khẩu",
 * `refine` cấp object với `path` là ô đích) vì thế đứng yên khi sửa ô nguồn: sửa "Mật khẩu" cho khớp mà
 * lỗi "không khớp" vẫn còn. Hook này kiểm lại ô đích mỗi khi ô nguồn đổi — chỉ khi ô đích đã chạm
 * (hoặc đã submit), để không la "bắt buộc" ở ô người dùng chưa tới. Khác `deps` của `register`: `deps`
 * kiểm cả ô chưa chạm.
 */
export function useRevalidateWhenTouched<T extends FieldValues>(
  form: UseFormReturn<T>,
  source: FieldPath<T>,
  target: FieldPath<T>,
) {
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (name !== source) return
      if (form.getFieldState(target).isTouched || form.formState.isSubmitted) {
        void form.trigger(target)
      }
    })
    return () => subscription.unsubscribe()
  }, [form, source, target])
}
