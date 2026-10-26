import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Bấm nút xác nhận trong hộp `ConfirmDialog` (`role="alertdialog"`) đang mở, vd "Xác nhận tạo kho". */
export async function confirmDialog(user: UserEvent, confirmLabel: string) {
  const dialog = await screen.findByRole('alertdialog')
  await user.click(within(dialog).getByRole('button', { name: confirmLabel }))
}

/**
 * Bấm nút xác nhận trong hộp `role="dialog"` đang mở — bước xác nhận nằm TRONG hộp sẵn có (nhóm C),
 * vd "Xác nhận nhập kho". Hộp `ConfirmDialog` (`alertdialog`) dùng `confirmDialog`.
 */
export async function confirmStep(user: UserEvent, confirmLabel: string) {
  // Có thể có hai hộp chồng nhau (vd hộp thêm vật tư mở trên hộp "Chọn nhiều vật tư") → lấy hộp trên cùng.
  const dialogs = await screen.findAllByRole('dialog')
  const dialog = dialogs[dialogs.length - 1]
  await user.click(within(dialog).getByRole('button', { name: confirmLabel }))
}
