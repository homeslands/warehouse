import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { useWarehouseStore } from '@/entities/warehouse'
import { WarehouseBarButton } from '@/shared/ui'

/** Nút kho đang chọn ở góc phải thanh điều hướng của mọi tab: mở bảng đổi kho. */
export function WarehouseHeaderButton() {
  const { t } = useTranslation('auth')
  const router = useRouter()
  const warehouse = useWarehouseStore((s) => s.current)
  if (!warehouse) return null
  return (
    <WarehouseBarButton
      label={warehouse.code || warehouse.name}
      accessibilityLabel={t('warehouseButton', { name: warehouse.name })}
      onPress={() => router.navigate('/switch-warehouse')}
    />
  )
}
