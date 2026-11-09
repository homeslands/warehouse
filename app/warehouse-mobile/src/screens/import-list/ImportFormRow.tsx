import { Check, Pencil, X, type LucideIcon } from '@/shared/ui/icons'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import type { ImportForm, ImportFormStatus } from '@/entities/import-form'
import { formatMoney, formatTime } from '@/shared/lib/format'
import { useTheme } from '@/shared/theme/useTheme'
import { ROW_PRESS_DELAY_MS, Text } from '@/shared/ui'

export type ImportFormRowProps = {
  form: ImportForm
  locale: 'vi' | 'en'
  onPress: (form: ImportForm) => void
}

/** Ô trạng thái (34pt) + lề chữ: đường kẻ giữa các dòng lùi bằng đây. */
const TILE = 34
const ROW_PAD = 16
const ROW_GAP = 12
export const IMPORT_ROW_INSET = ROW_PAD + TILE + ROW_GAP
/** Cột phải rộng cố định: tổng tiền rất lớn co chữ lại chứ không đẩy cột trái. */
const END_COLUMN = 108

const TILE_ICON: Record<ImportFormStatus, LucideIcon> = {
  DRAFT: Pencil,
  CONFIRMED: Check,
  CANCELLED: X,
}

/**
 * Một dòng phiếu nhập (hướng B): ô trạng thái bo 10 (Nháp: bút chì vàng; Đã nhập: dấu tích xanh;
 * Huỷ: dấu ✕ xám); dòng 1 mã phiếu (code) đậm; dòng 2 "HĐ … · PO … · người tạo"; cột phải tổng tiền (numeric)
 * + giờ tạo. Mọi chữ một dòng. Nền do khối bo góc của nhóm ngày vẽ.
 */
export const ImportFormRow = memo(function ImportFormRow({
  form,
  locale,
  onPress,
}: ImportFormRowProps) {
  const { t } = useTranslation('importForms')
  const { colors } = useTheme()
  const tone = {
    DRAFT: { bg: colors.warningSoft, fg: colors.warningText },
    CONFIRMED: { bg: colors.successSoft, fg: colors.successText },
    CANCELLED: { bg: colors.fill, fg: colors.mutedForeground },
  }[form.status]
  const Icon = TILE_ICON[form.status]
  const invoice = t('list.invoice', { code: form.invoiceCode })
  const po = form.purchaseOrder ? t('list.purchaseOrder', { code: form.purchaseOrder }) : null
  const meta = [invoice, po, form.requesterName].filter(Boolean).join(' · ')
  const total = formatMoney(form.total, locale)
  const time = formatTime(form.createdAt)
  const label = [
    form.code,
    t(`status.${form.status}`),
    invoice,
    po,
    form.requesterName,
    total,
    time,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <Pressable
      testID="import-row"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(form)}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: ROW_GAP,
        minHeight: 64,
        paddingHorizontal: ROW_PAD,
        paddingVertical: 12,
        backgroundColor: pressed ? colors.rowPressed : colors.card,
      })}
    >
      <View
        testID={`import-tile-${form.status}`}
        style={{
          width: TILE,
          height: TILE,
          borderRadius: 10,
          backgroundColor: tone.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} color={tone.fg} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text code weight="semibold" size={15} numberOfLines={1}>
          {form.code}
        </Text>
        <Text muted size={12.5} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View testID="import-row-end" style={{ width: END_COLUMN, alignItems: 'flex-end', gap: 4 }}>
        <Text
          numeric
          weight="semibold"
          size={14}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {total}
        </Text>
        <Text muted size={11.5} numberOfLines={1}>
          {time}
        </Text>
      </View>
    </Pressable>
  )
})
