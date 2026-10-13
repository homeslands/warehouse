import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { Warehouse } from '@/entities/warehouse'

type Props = {
  warehouses: Pick<Warehouse, 'slug' | 'code' | 'name' | 'isActive'>[]
  value: string | undefined
  onChange: (slug: string) => void
}

/** Ô chọn kho đầu các màn phiếu. Tên khả truy cập qua `aria-label` (nút mở không phải control của `<label>`). */
export function WarehousePicker({ warehouses, value, onChange }: Props) {
  const { t } = useTranslation(['importForms'])
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={t('importForms:warehouse')} className="w-full sm:w-72">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {warehouses.map((w) => (
          <SelectItem key={w.slug} value={w.slug}>
            {`${w.code} · ${w.name}`}
            {!w.isActive && ` (${t('importForms:warehouseInactiveTag')})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
