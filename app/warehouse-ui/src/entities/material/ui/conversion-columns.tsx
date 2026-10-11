import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { Trans } from 'react-i18next'
import { formatQuantity } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/badge'
import type { MaterialConversionUnit } from '../model/types'

/** Cột bảng đơn vị quy đổi. `baseUnitCode` là mã đơn vị gốc của vật tư. Cột thao tác do tầng trên thêm. */
export function buildConversionUnitColumns(
  t: TFunction<readonly ['materials', 'common']>,
  baseUnitCode: string,
): ColumnDef<MaterialConversionUnit>[] {
  const rate = (row: MaterialConversionUnit) => (
    <Trans
      ns={['materials', 'common']}
      i18nKey="materials:rateValueRich"
      values={{ unit: row.unitCode, rate: formatQuantity(row.conversionRate), base: baseUnitCode }}
      components={[<span key="0" />, <span key="1" className="whitespace-nowrap tabular-nums" />]}
    />
  )
  return [
    {
      accessorKey: 'unitCode',
      header: t('materials:columnUnit'),
      // Tên / mã đơn vị dài phải ngắt dòng (`min-w-0` để hàng flex co được): để một dòng thì đẩy cột Tỉ lệ ra khỏi
      // khung. Khung hẹp ẩn cột Tỉ lệ → tỉ lệ hiện ở dòng phụ ngay dưới tên, con số không bao giờ bị che.
      cell: ({ row }) => (
        <span className="flex max-w-60 min-w-32 flex-col gap-1 whitespace-normal @sm:max-w-80">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="min-w-0 font-medium break-words">{row.original.unitCode}</span>
            <span className="text-muted-foreground min-w-0 break-words whitespace-normal">
              {row.original.unitName}
            </span>
          </span>
          {row.original.isBaseUnit && (
            <Badge variant="secondary">{t('materials:baseUnitBadge')}</Badge>
          )}
          <span className="text-sm break-words @sm:hidden">{rate(row.original)}</span>
        </span>
      ),
    },
    {
      accessorKey: 'conversionRate',
      header: t('materials:columnRate'),
      meta: { hideBelow: '@sm' },
      // Ô được xuống dòng (mã đơn vị tới 32 ký tự) nhưng con số thì không bao giờ bị tách hay che.
      cell: ({ row }) => (
        <span className="block min-w-28 break-words whitespace-normal">{rate(row.original)}</span>
      ),
    },
  ]
}
