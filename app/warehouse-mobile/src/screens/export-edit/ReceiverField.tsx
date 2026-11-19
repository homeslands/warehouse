import { useTranslation } from 'react-i18next'

import { useAuthStore, type UserWarehouse } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { FormInfoRow } from '@/shared/ui'

/** `EXPORT_FORM_RECEIVER_MAX_LENGTH`. */
export const RECEIVER_MAX = 255

const NO_WAREHOUSES: UserWarehouse[] = []

/** Kho người dùng chọn được làm đích Chuyển kho (ADMIN+: mọi kho trong store kho; còn lại: kho của mình). */
export function useReceiverWarehouses(): readonly UserWarehouse[] {
  const fetched = useWarehouseStore((s) => s.warehouses)
  const mine = useAuthStore((s) => s.user?.warehouses ?? NO_WAREHOUSES)
  return fetched ?? mine
}

/**
 * Dòng Người nhận của nhóm Thông tin (bước 1 phiếu xuất): dòng chọn giống dòng Loại (chữ accent + `⌄`, chưa
 * có giá trị → "Chọn"). Chạm → `onPress` (màn mở sheet `/export-receiver` — chọn từ danh sách hoặc gõ tên
 * mới); tên dài cắt một dòng.
 */
export function ReceiverField({
  value,
  error,
  highlighted,
  onPress,
}: {
  value: string
  error?: string | null
  highlighted?: boolean
  onPress: () => void
}) {
  const { t } = useTranslation('exportForms')
  return (
    <FormInfoRow
      kind="picker"
      testID="export-field-receiver"
      label={t('fields.receiver')}
      required
      value={value === '' ? null : value}
      placeholder={t('receiverPicker.placeholder')}
      chevron="down"
      accentValue
      error={error}
      highlighted={highlighted}
      onPress={onPress}
    />
  )
}
