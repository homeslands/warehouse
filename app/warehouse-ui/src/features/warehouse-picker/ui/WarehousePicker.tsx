import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { CHIP_FRAME, CHIP_INNER, useFilterDisplay } from '@/shared/ui/data-table/filter-display'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { Warehouse } from '@/entities/warehouse'

type Props = {
  warehouses: Pick<Warehouse, 'slug' | 'code' | 'name' | 'isActive'>[]
  value: string | undefined
  onChange: (slug: string) => void
}

/**
 * Ô chọn kho trên thanh lọc của các màn phiếu (đặt trong `filters` của `ListToolbar`). Trông như
 * `SelectFilter`, nhưng luôn có một kho được chọn: không có mục "tất cả", dạng chip (mobile) không có ✕.
 * Tên khả truy cập qua `aria-label` (nút mở không phải control của `<label>`).
 */
export function WarehousePicker({ warehouses, value, onChange }: Props) {
  const { t } = useTranslation(['importForms'])
  const display = useFilterDisplay()
  const label = (w: Props['warehouses'][number]) => `${w.code} · ${w.name}`
  const current = warehouses.find((w) => w.slug === value)
  // Tên kho dài bị cắt "…" trong độ rộng tối đa — `title` cho đọc được nhãn đầy đủ.
  const title = current ? label(current) : undefined

  const content = (
    <SelectContent>
      {warehouses.map((w) => (
        <SelectItem key={w.slug} value={w.slug}>
          {label(w)}
          {!w.isActive && ` (${t('importForms:warehouseInactiveTag')})`}
        </SelectItem>
      ))}
    </SelectContent>
  )

  if (display === 'chip') {
    return (
      <div data-active="true" className={CHIP_FRAME}>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger
            aria-label={t('importForms:warehouse')}
            title={title}
            className={cn(
              'h-full max-w-48 rounded-full border-0 bg-transparent pl-3.5 font-medium shadow-none dark:bg-transparent dark:hover:bg-transparent',
              CHIP_INNER,
            )}
          >
            <SelectValue />
          </SelectTrigger>
          {content}
        </Select>
      </div>
    )
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={t('importForms:warehouse')} title={title} className="max-w-56">
        <SelectValue />
      </SelectTrigger>
      {content}
    </Select>
  )
}
