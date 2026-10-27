/** Số dòng có đơn giá là số > 0 — dùng cho hộp hỏi "Bỏ đơn giá của n dòng?". */
export const pricedLinesCount = (items: { unitPrice?: number }[]): number =>
  items.filter((i) => typeof i.unitPrice === 'number' && i.unitPrice > 0).length

/** Xoá giá (không đặt 0) để quay lại Bán thì ô trống và bắt nhập. */
export const clearPrices = <T extends { unitPrice?: number }>(items: T[]): T[] =>
  items.map((i) => ({ ...i, unitPrice: undefined }))

type PriceForm = {
  getValues: () => { items: { unitPrice?: number }[] }
  setValue: (name: 'items', value: never, options: { shouldDirty: boolean }) => void
  control: { _defaultValues: unknown }
}

/**
 * Xoá giá của MỌI dòng ngay trong form: đặt giá trị về undefined VÀ bỏ giá khỏi `defaultValues`. Chỉ `setValue` là
 * chưa đủ — khi giá là undefined, RHF (register / Controller / useWatch) lấy lại giá MẶC ĐỊNH (nháp đã tải có giá), nên
 * đổi Bán → Khác → Bán làm giá cũ "hồi sinh" trong dữ liệu dù ô trống. Gọi khi người dùng xác nhận "Bỏ đơn giá".
 */
export function clearLinePrices(form: PriceForm): void {
  const items = form.getValues().items
  form.setValue('items', clearPrices(items) as never, { shouldDirty: true })
  const defaults = (
    form.control._defaultValues as { items?: ({ unitPrice?: number } | undefined)[] }
  ).items
  defaults?.forEach((row) => {
    if (row) row.unitPrice = undefined
  })
}
