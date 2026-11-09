import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import type { UserWarehouse } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { errorMessage } from '@/shared/api/error-message'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'

/** Hộp thoại báo `select()` lỗi ("Không đổi được kho" + lý do). Dùng chung cho màn và sheet. */
export function useSelectWarehouseErrorAlert() {
  const { t } = useTranslation(['auth', 'errors'])
  return (e: unknown) => Alert.alert(t('auth:selectWarehouseFailed'), errorMessage(e, t))
}

/**
 * Màn chọn kho lần đầu: chạm là ghi (`select()`), xong thì gọi `onApplied` (nơi gọi điều hướng).
 * Khoá chống bấm đôi; lỗi → hộp thoại báo lỗi, màn giữ nguyên để thử lại. (Sheet đổi kho dùng
 * `useSheetSubmit` thay vì hook này.)
 */
export function useApplyWarehouse(onApplied: (warehouse: UserWarehouse) => void) {
  const alertError = useSelectWarehouseErrorAlert()
  const { run, pending } = useGuardedAction(
    async (warehouse: UserWarehouse) => {
      await useWarehouseStore.getState().select(warehouse)
      onApplied(warehouse)
    },
    { onError: alertError },
  )
  return { apply: run, pending }
}
