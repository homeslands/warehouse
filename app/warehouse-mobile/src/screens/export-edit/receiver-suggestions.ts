import { RECEIVER_SUGGESTIONS_MAX, type ExportFormType } from '@/entities/export-form'
import type { UserWarehouse } from '@/entities/session'

export type ReceiverChoice = { label: string; value: string; selected: boolean }

/** Khoá so sánh tên người nhận: bỏ khoảng trắng thừa, không phân biệt hoa thường. */
export const receiverKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Lựa chọn của menu Người nhận (mục "Nhập tên khác…" do UI thêm). Chuyển kho: các kho trừ kho hiện tại,
 * nhãn "Tên kho (MÃ)", `value` = tên kho (đúng chuỗi `receiver` lưu từ trước). Loại khác: tối đa 8 người
 * nhận gần đây (mới nhất trước). Cả hai: giá trị đang có mà không nằm trong danh sách (gõ tay) đứng đầu.
 */
export function receiverChoices(
  type: ExportFormType,
  {
    warehouses,
    currentSlug,
    recent,
    value,
  }: {
    warehouses: readonly UserWarehouse[]
    currentSlug: string | undefined
    recent: readonly string[]
    value: string
  },
): ReceiverChoice[] {
  const cur = receiverKey(value)
  if (type === 'TRANSFER') {
    const list = warehouses
      .filter((w) => w.slug !== currentSlug)
      .map((w) => ({
        label: `${w.name} (${w.code})`,
        value: w.name,
        selected: cur !== '' && receiverKey(w.name) === cur,
      }))
    if (cur !== '' && !list.some((c) => c.selected)) {
      list.unshift({ label: value.trim(), value: value.trim(), selected: true })
    }
    return list
  }
  const list = recent.slice(0, RECEIVER_SUGGESTIONS_MAX).map((r) => ({
    label: r,
    value: r,
    selected: cur !== '' && receiverKey(r) === cur,
  }))
  if (cur !== '' && !list.some((c) => c.selected)) {
    list.unshift({ label: value.trim(), value: value.trim(), selected: true })
  }
  return list
}

/**
 * `receiver` còn hợp lệ khi đổi loại `prev` → `next`? Chỉ xét khi đổi "kiểu" (Chuyển kho ↔ loại khác); cùng
 * kiểu luôn giữ. → Chuyển kho: phải là tên một kho; Chuyển kho → loại khác: chỉ bỏ khi là tên kho (tên gõ
 * tay giữ lại).
 */
export function isReceiverValidFor(
  prev: ExportFormType,
  next: ExportFormType,
  receiver: string,
  warehouses: readonly UserWarehouse[],
): boolean {
  if ((next === 'TRANSFER') === (prev === 'TRANSFER')) return true
  const key = receiverKey(receiver)
  const isWarehouse = warehouses.some((w) => receiverKey(w.name) === key)
  return next === 'TRANSFER' ? isWarehouse : !(key !== '' && isWarehouse)
}
