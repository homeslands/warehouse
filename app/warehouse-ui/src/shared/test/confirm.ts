import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Bấm nút xác nhận trong hộp `ConfirmDialog` (`role="alertdialog"`) đang mở, vd "Xác nhận tạo kho". */
export async function confirmDialog(user: UserEvent, confirmLabel: string) {
  const dialog = await screen.findByRole('alertdialog')
  await user.click(within(dialog).getByRole('button', { name: confirmLabel }))
}
