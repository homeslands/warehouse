import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import type { ImportForm, ImportFormStatus } from '@/entities/import-form'
import { formatDayMonth, formatMoney, formatTime } from '@/shared/lib/format'
import type { ColorTokens } from '@/shared/theme/tokens'
import { useTheme } from '@/shared/theme/useTheme'
import { PlainListRow, RowLine, RowStatus, Text } from '@/shared/ui'
import { PackagePlus } from '@/shared/ui/icons'

export type ImportFormRowProps = {
  form: ImportForm
  locale: 'vi' | 'en'
  onPress: (form: ImportForm) => void
  /** Dòng đầu nhóm tháng (không đường kẻ phía trên). */
  first: boolean
  /** Hiện trạng thái ở cột phải — chỉ khi đang xem "Tất cả" (lọc một trạng thái thì mọi dòng giống nhau). */
  showStatus: boolean
}

/** Chữ trạng thái nghiêng màu tươi (đủ AA). Màu CHỈ dành cho trạng thái (ô icon trung tính). */
function statusColor(colors: ColorTokens, status: ImportFormStatus) {
  return {
    DRAFT: colors.statusWarning,
    CONFIRMED: colors.statusSuccess,
    CANCELLED: colors.statusNeutral,
  }[status]
}

/**
 * Một dòng phiếu nhập — danh sách kiểu lịch sử giao dịch (`PlainListRow`, gom theo tháng): ô icon trung
 * tính "hộp +" (điểm neo, không màu); [mã 16 semibold, cắt GIỮA | tổng 16 semibold — 0 đ xám, phiếu huỷ
 * xám gạch ngang] / [giờ · dd/MM | chữ trạng thái nghiêng màu tươi, chỉ khi "Tất cả"] / [HĐ · PO · người tạo].
 */
export const ImportFormRow = memo(function ImportFormRow({
  form,
  locale,
  onPress,
  first,
  showStatus,
}: ImportFormRowProps) {
  const { t } = useTranslation('importForms')
  const { colors } = useTheme()
  const status = t(`status.${form.status}`)
  const invoice = t('list.invoice', { code: form.invoiceCode })
  const po = form.purchaseOrder ? t('list.purchaseOrder', { code: form.purchaseOrder }) : null
  const total = formatMoney(form.total, locale)
  const time = formatTime(form.createdAt)
  const when = [time, formatDayMonth(form.createdAt)].filter(Boolean).join(' · ')
  const cancelled = form.status === 'CANCELLED'
  const label = [form.code, status, invoice, po, form.requesterName, total, time]
    .filter(Boolean)
    .join(', ')
  return (
    <PlainListRow
      testID="import-row"
      accessibilityLabel={label}
      onPress={() => onPress(form)}
      first={first}
      tile={{ icon: PackagePlus, testID: 'import-tile' }}
    >
      <RowLine
        endTestID="import-row-end"
        end={
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
                : form.total === 0
                  ? { color: colors.mutedForeground }
                  : undefined
            }
          >
            {total}
          </Text>
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
              testID={`import-status-${form.status}`}
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
          {[invoice, po, form.requesterName].filter(Boolean).join(' · ')}
        </Text>
      </RowLine>
    </PlainListRow>
  )
})
