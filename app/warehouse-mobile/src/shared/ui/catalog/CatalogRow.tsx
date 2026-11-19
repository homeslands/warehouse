import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { PlainListRow, RowLine } from '../card'
import { Package, Ruler, Tag } from '../icons'
import { Text } from '../Text'

export type CatalogRowKind = 'unit' | 'material-type' | 'material'

export type CatalogRowProps = {
  kind: CatalogRowKind
  slug: string
  code: string
  name: string
  description?: string | null
  /** Số vật tư đang dùng đơn vị (`materialCount.total`). Chỉ Đơn vị; 0 / bỏ trống = chưa dùng. */
  usedCount?: number
  /** Chữ ngắn ở cột phải (Vật tư: mã đơn vị gốc). Bỏ qua khi có `usedCount`. */
  endLabel?: string
  /** Dòng đầu nhóm / danh sách (không đường kẻ phía trên). */
  first: boolean
  onPress: (slug: string) => void
}

/**
 * Một dòng danh mục — CÙNG KHUÔN dòng Nhập / Xuất / Tồn kho (`PlainListRow`, đồng bộ 2026-11-19): ô icon
 * 44 TRUNG TÍNH theo loại danh mục (Đơn vị thước, Loại vật tư nhãn, Vật tư hộp); [tên 16 semibold | cột
 * phải] / [mã · mô tả 14 xám — font hệ thống]. Cột phải: Đơn vị đang dùng "6 vật tư" (số 16 medium + chữ 14
 * xám); Vật tư: mã đơn vị gốc 14 xám. Mọi chữ một dòng.
 */
export const CatalogRow = memo(function CatalogRow({
  kind,
  slug,
  code,
  name,
  description,
  usedCount = 0,
  endLabel,
  first,
  onPress,
}: CatalogRowProps) {
  const { t } = useTranslation('catalog')
  const inUse = kind === 'unit' && usedCount > 0
  const Icon = kind === 'unit' ? Ruler : kind === 'material' ? Package : Tag
  const unitLabel = t('unit.usage.unit', { count: usedCount })
  const label = [name, code, description, inUse ? `${usedCount} ${unitLabel}` : endLabel]
    .filter(Boolean)
    .join(', ')
  const end = inUse ? (
    <Text testID="catalog-row-end" numeric weight="medium" size={16} numberOfLines={1}>
      {usedCount}
      <Text muted size={14}>
        {` ${unitLabel}`}
      </Text>
    </Text>
  ) : endLabel ? (
    <Text testID="catalog-row-end" muted size={14} numberOfLines={1}>
      {endLabel}
    </Text>
  ) : null
  return (
    <PlainListRow
      testID="catalog-row"
      accessibilityLabel={label}
      onPress={() => onPress(slug)}
      first={first}
      tile={{ icon: Icon, testID: 'catalog-tile' }}
    >
      <RowLine end={end}>
        <Text weight="semibold" size={16} numberOfLines={1}>
          {name}
        </Text>
      </RowLine>
      <RowLine>
        <Text muted size={14} numberOfLines={1}>
          {[code, description].filter(Boolean).join(' · ')}
        </Text>
      </RowLine>
    </PlainListRow>
  )
})
