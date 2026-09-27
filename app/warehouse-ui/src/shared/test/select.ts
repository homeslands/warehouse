import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/**
 * Chọn một mục trong `Select` của shadcn (Radix). Khác `<select>` gốc, nó là nút mở + danh sách
 * trong portal, nên `user.selectOptions` không dùng được — phải mở rồi bấm vào mục.
 *
 * `selectName` là tên khả truy cập của nút mở (thường đặt bằng `aria-label`).
 */
export async function chooseOption(user: UserEvent, selectName: string, optionLabel: string) {
  await user.click(screen.getByRole('combobox', { name: selectName }))
  await user.click(await screen.findByRole('option', { name: optionLabel }))
}

/** Nhãn đang hiện trên nút mở của một `Select`. */
export function selectedLabel(selectName: string) {
  return screen.getByRole('combobox', { name: selectName }).textContent
}
