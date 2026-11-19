import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  exportHasPrice,
  type ExportForm,
  type ExportFormStatus,
  type ExportFormType,
} from '@/entities/export-form'
import { formatDayMonth, formatMoney, formatTime } from '@/shared/lib/format'
import type { ColorTokens } from '@/shared/theme/tokens'
import { useTheme } from '@/shared/theme/useTheme'
import { PlainListRow, RowLine, RowStatus, Text } from '@/shared/ui'
import {
  ArrowLeftRight,
  Factory,
  Package,
  ShoppingCart,
  Trash2,
  type LucideIcon,
} from '@/shared/ui/icons'

export type ExportFormRowProps = {
  form: ExportForm
  locale: 'vi' | 'en'
  onPress: (form: ExportForm) => void
  /** Dòng đầu nhóm tháng (không đường kẻ phía trên). */
  first: boolean
  /** Hiện trạng thái ở cột phải — chỉ khi đang xem "Tất cả" (lọc một trạng thái thì mọi dòng giống nhau). */
  showStatus: boolean
}

/** Hình icon theo LOẠI phiếu trong ô trung tính — hình nói loại, không mang màu. */
const TYPE_ICON: Record<ExportFormType, LucideIcon> = {
  SALE: ShoppingCart,
  PRODUCTION: Factory,
  TRANSFER: ArrowLeftRight,
  DISPOSAL: Trash2,
  OTHER: Package,
}

/** Chữ trạng thái nghiêng màu tươi (đủ AA). Màu CHỈ dành cho trạng thái (ô icon trung tính). */
function statusColor(colors: ColorTokens, status: ExportFormStatus) {
  return {
    DRAFT: colors.statusWarning,
    PENDING: colors.statusAccent,
    CONFIRMED: colors.statusSuccess,
    CANCELLED: colors.statusNeutral,
  }[status]
}

/**
 * Một dòng phiếu xuất — danh sách kiểu lịch sử giao dịch (`PlainListRow`, gom theo tháng): ô icon trung
 * tính, HÌNH theo loại; [mã 16 semibold, cắt GIỮA | tổng 16 semibold — chỉ phiếu Bán (như web), phiếu huỷ
 * xám gạch ngang] / [giờ · dd/MM | chữ trạng thái nghiêng màu tươi, chỉ khi "Tất cả"] / [Loại · người nhận · người lập].
 */
export const ExportFormRow = memo(function ExportFormRow({
  form,
  locale,
  onPress,
  first,
  showStatus,
}: ExportFormRowProps) {
  const { t } = useTranslation('exportForms')
  const { colors } = useTheme()
  const status = t(`status.${form.status}`)
  const type = t(`type.${form.type}`)
  // Chỉ phiếu Bán có đơn giá (như web) → loại khác không hiện / không đọc tổng tiền.
  const total = exportHasPrice(form.type) ? formatMoney(form.totalAmount, locale) : null
  const time = formatTime(form.createdAt)
  const when = [time, formatDayMonth(form.createdAt)].filter(Boolean).join(' · ')
  const cancelled = form.status === 'CANCELLED'
  const label = [form.code, status, type, form.receiver, form.requesterName, total, time]
    .filter(Boolean)
    .join(', ')
  return (
    <PlainListRow
      testID="export-row"
      accessibilityLabel={label}
      onPress={() => onPress(form)}
      first={first}
      tile={{ icon: TYPE_ICON[form.type], testID: `export-tile-${form.type}` }}
    >
      <RowLine
        endTestID="export-row-end"
        end={
          total !== null ? (
            <Text
              numeric
              weight="semibold"
              size={16}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              style={
                cancelled
                  ? { color: colors.mutedForeground, textDecorationLine: 'line-through' }
                  : form.totalAmount === 0
                    ? { color: colors.mutedForeground }
                    : undefined
              }
            >
              {total}
            </Text>
          ) : null
        }
      >
        <Text numeric weight="semibold" size={16} numberOfLines={1} ellipsizeMode="middle">
          {form.code}
        </Text>
      </RowLine>
      <RowLine
        end={
          showStatus ? (
            <RowStatus
              testID={`export-status-${form.status}`}
              label={status}
              color={statusColor(colors, form.status)}
            />
          ) : null
        }
      >
        <Text muted numeric size={14} numberOfLines={1}>
          {when}
        </Text>
      </RowLine>
      <RowLine>
        <Text muted size={14} numberOfLines={1}>
          {[type, form.receiver, form.requesterName].filter(Boolean).join(' · ')}
        </Text>
      </RowLine>
    </PlainListRow>
  )
})
