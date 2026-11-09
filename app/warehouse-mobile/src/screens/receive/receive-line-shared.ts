import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useMemo, useState } from 'react'
import { Platform } from 'react-native'

import { importFormAbilities, useImportForm, type ImportFormAccess } from '@/entities/import-form'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { useReceiveDraft } from '@/features/receive-checklist'
import {
  formatQuantity,
  parseLocalDate,
  todayLocalIso,
  type FormatLocale,
} from '@/shared/lib/format'

/*
 * Phần dùng chung của hai thân sheet dòng phiếu nhập (`/import-line`): checklist Kiểm hàng
 * (`ReceiveLineSheetScreen`) và soạn phiếu ở bước 2 (`ComposeLineSheet`).
 */

/** Ghi chú một dòng: web không giới hạn, chặn ở đây để ô một dòng không phình vô hạn. */
export const NOTE_MAX_LENGTH = 500

/** Số lượng có tới 6 chữ số lẻ: hiện đủ (mặc định của `formatQuantity` chỉ 3). */
export const formatQty = (n: number, l: FormatLocale) => formatQuantity(n, l, 6)

/** Quyền trên phiếu đang mở (tải phiếu nếu đã có trên server) + khoá đang Lưu / Xác nhận. */
export function useLineAccess() {
  const user = useAuthStore((s) => s.user)
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const formSlug = useReceiveDraft((s) => s.ctx?.formSlug)
  const query = useImportForm(warehouseSlug, formSlug && formSlug !== 'new' ? formSlug : undefined)
  const access = useMemo<ImportFormAccess | null>(
    () => (user ? { can: (c) => can(user, c), userSlug: user.userSlug ?? null } : null),
    [user],
  )
  const waiting = formSlug !== 'new' && query.isPending && !query.isError
  // Đang Lưu / Xác nhận: kết quả sẽ thay bản nháp → bảng chỉ đọc, không ghi gì (store cũng chặn).
  const saving = useReceiveDraft((s) => s.saving)
  const abilities = !access
    ? null
    : formSlug === 'new'
      ? importFormAbilities(access, 'new')
      : query.data
        ? importFormAbilities(access, query.data)
        : null
  return { abilities, waiting, saving, warehouseSlug }
}

/**
 * Hạn dùng của dòng: iOS lịch inline (`picking`), Android hộp chọn ngày của hệ thống; hạn trước ngày phiếu
 * bị chặn ngay trên máy (không chờ 101333) — giữ hạn cũ, bật `expiryError`.
 */
export function useExpiryField(initial: string | null, formDate: string, openAtStart: boolean) {
  const [expiry, setExpiry] = useState<string | null>(initial)
  const [expiryError, setExpiryError] = useState(false)
  // `?focus=expiry` trên iOS: lịch inline mở sẵn (Android mở hộp chọn của hệ thống — màn tự gọi).
  const [picking, setPicking] = useState(() => openAtStart && Platform.OS !== 'android')
  const minimumDate = useMemo(() => parseLocalDate(formDate), [formDate])
  const pickerValue = expiry
    ? parseLocalDate(expiry)
    : parseLocalDate(todayLocalIso()) < minimumDate
      ? minimumDate
      : parseLocalDate(todayLocalIso())

  const applyExpiry = (date: Date | undefined) => {
    setPicking(false)
    if (!date) return
    const iso = todayLocalIso(date)
    // ISO cùng độ dài so được theo chữ.
    if (iso < formDate) {
      setExpiryError(true)
      return
    }
    setExpiryError(false)
    setExpiry(iso)
  }
  /** Android: hộp chọn ngày của hệ thống (không có lịch inline). */
  const openAndroidPicker = () =>
    DateTimePickerAndroid.open({
      value: pickerValue,
      mode: 'date',
      minimumDate,
      onValueChange: (_e, date) => applyExpiry(date),
    })
  const openPicker = () => {
    if (Platform.OS === 'android') openAndroidPicker()
    else setPicking((p) => !p)
  }
  const clear = () => {
    setExpiry(null)
    setExpiryError(false)
  }
  return {
    expiry,
    expiryError,
    picking,
    minimumDate,
    pickerValue,
    applyExpiry,
    openAndroidPicker,
    openPicker,
    clear,
  }
}
