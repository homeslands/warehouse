import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { Warehouse } from '@/entities/warehouse'

type Props = {
  warehouses: Pick<Warehouse, 'slug' | 'code' | 'name' | 'isActive'>[]
  value: string | undefined
  onChange: (slug: string) => void
  /** `id` của nút mở — để `<label htmlFor>` của trang trỏ tới. Có `id` thì tên đọc từ nhãn đó, không `aria-label`. */
  id?: string
}

/**
 * Ô chọn kho của các màn phiếu. Kho là ngữ cảnh của cả trang chứ không phải bộ lọc → đặt ở đầu trang (cạnh
 * tiêu đề), không trong `filters` của `ListToolbar`. Luôn có một kho được chọn: không có mục "tất cả".
 * Rộng theo nội dung (tới `max-w-full`), tên quá dài thì cắt "…" và có `title`. Tên khả truy cập qua `aria-label`.
 */
export function WarehousePicker({ warehouses, value, onChange, id }: Props) {
  const { t } = useTranslation(['importForms'])
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

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        aria-label={id ? undefined : t('importForms:warehouse')}
        title={title}
        className="max-w-full min-w-0"
      >
        <SelectValue />
      </SelectTrigger>
      {content}
    </Select>
  )
}
