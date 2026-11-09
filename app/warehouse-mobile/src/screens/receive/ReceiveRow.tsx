import { Check, X } from '@/shared/ui/icons'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { round6, type LineStatus, type LocalLine } from '@/features/receive-checklist'
import { formatQuantity } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'
import { ROW_PRESS_DELAY_MS, Text } from '@/shared/ui'

export type ReceiveRowProps = {
  line: LocalLine
  status: LineStatus
  locale: 'vi' | 'en'
  /**
   * `'check'`: vòng tròn đánh dấu + chạm phần chữ mở bảng sửa. `'review'` (cờ checklist tắt): không
   * vòng tròn, cả dòng bấm được để mở bảng sửa. `'view'` (chỉ đọc, vd phiếu không còn Nháp): không bấm
   * được. (Người chỉ sửa được dùng màn soạn, không dùng danh sách này.)
   */
  mode: 'check' | 'review' | 'view'
  /** Đang ghi lên server: không đánh dấu / mở bảng sửa được. */
  disabled?: boolean
  /** Dòng bị chặn khi lưu (vd hạn dùng trước ngày phiếu): tô đỏ nhạt. */
  flagged?: boolean
  /** Vị trí trong khối bo tròn: dòng đầu bo trên (không kẻ phía trên), dòng cuối bo dưới. */
  first?: boolean
  last?: boolean
  onToggle: (key: string) => void
  onOpen: (key: string) => void
}

/** Lề trái tới vòng tròn và chỗ chữ bắt đầu (lề 9 + vùng chạm 44 + 3) — đường kẻ lùi theo đó. */
const CHECK_LEFT = 9
const CHECK_AREA = CHECK_LEFT + 44 + 3

function ReceiveRowImpl({
  line,
  status,
  locale,
  mode,
  disabled = false,
  flagged = false,
  first = false,
  last = false,
  onToggle,
  onOpen,
}: ReceiveRowProps) {
  const { t } = useTranslation('importForms')
  const { colors, radius } = useTheme()
  const diff = status === 'diff'
  const zero = status === 'zero'
  const circleBg = {
    unchecked: 'transparent',
    match: colors.success,
    diff: colors.warning,
    zero: colors.destructive,
  }[status]
  const circleBorder = status === 'unchecked' ? colors.border : circleBg
  // Số lượng có tới 6 chữ số lẻ: hiện đủ như bảng sửa / hộp hỏi (3 số lẻ làm 0,000001 thành "+0").
  const qty6 = (n: number) => formatQuantity(n, locale, 6)

  // Dòng thêm trên máy không có số phiếu để so: không có dòng phụ, chỉ có viên "Mới" sau mã.
  const added = line.base === null
  let sub: string | null = null
  if (zero) sub = t('receive.row.notReceived')
  else if (diff && line.base !== null) {
    const qty = qty6(line.base.quantity)
    const d = round6(line.quantity - line.base.quantity)
    sub =
      d === 0
        ? t('receive.row.edited', { qty })
        : t('receive.row.planDelta', { qty, delta: `${d < 0 ? '−' : '+'}${qty6(Math.abs(d))}` })
  }
  const accent = zero ? colors.destructiveText : diff ? colors.warningText : undefined

  const content = (
    <>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text weight="semibold" size={15} numberOfLines={2}>
          {line.materialName}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text code muted size={12} numberOfLines={1} style={{ flexShrink: 1 }}>
            {line.materialCode}
          </Text>
          {added ? (
            <View
              accessible
              accessibilityLabel={t('receive.row.added')}
              style={{
                flexShrink: 0,
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 999,
                backgroundColor: colors.accentSoft,
              }}
            >
              <Text weight="semibold" size={10.5} style={{ color: colors.accentText }}>
                {t('receive.row.new')}
              </Text>
            </View>
          ) : null}
        </View>
        {line.changedOnServer ? (
          <Text weight="medium" size={12} style={{ color: colors.warningText }}>
            {t('receive.row.changedOnWeb')}
          </Text>
        ) : null}
      </View>
      <View style={{ maxWidth: '40%', flexShrink: 0, alignItems: 'flex-end' }}>
        <Text
          numeric
          weight="semibold"
          size={15}
          numberOfLines={1}
          style={accent ? { color: accent } : undefined}
        >
          {`${qty6(line.quantity)} ${line.unitName}`}
        </Text>
        {sub ? (
          <Text
            numeric
            size={11.5}
            numberOfLines={1}
            style={{ color: accent ?? colors.mutedForeground }}
          >
            {sub}
          </Text>
        ) : null}
      </View>
    </>
  )

  // Một khối bo tròn kiểu inset-grouped: mỗi dòng tự bo góc theo vị trí (giữ ảo hoá của FlatList).
  const top = first ? radius.groupLarge : 0
  const bottom = last ? radius.groupLarge : 0
  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 60,
    backgroundColor: flagged ? colors.destructiveSoft : colors.card,
    borderTopLeftRadius: top,
    borderTopRightRadius: top,
    borderBottomLeftRadius: bottom,
    borderBottomRightRadius: bottom,
  }
  // Đường kẻ mảnh phía trên mỗi dòng (trừ dòng đầu), lùi vào tới chỗ bắt đầu chữ (sau vòng tròn).
  const separator = first ? null : (
    <View
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        left: mode === 'check' ? CHECK_AREA : 16,
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.separator,
      }}
    />
  )

  const plainPadding = { paddingHorizontal: 16, paddingVertical: 10, gap: 12 }

  if (mode === 'view') {
    return (
      <View testID={`receive-row-${line.key}`} style={[rowStyle, plainPadding]}>
        {separator}
        {content}
      </View>
    )
  }

  if (mode === 'review') {
    return (
      <View testID={`receive-row-${line.key}`} style={rowStyle}>
        {separator}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onOpen(line.key)}
          unstable_pressDelay={ROW_PRESS_DELAY_MS}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 10,
            paddingHorizontal: 16,
            alignSelf: 'stretch',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          {content}
        </Pressable>
      </View>
    )
  }

  const checked = status !== 'unchecked'
  return (
    <View testID={`receive-row-${line.key}`} style={[rowStyle, { paddingLeft: CHECK_LEFT }]}>
      {separator}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        accessibilityLabel={t(checked ? 'receive.row.unmark' : 'receive.row.mark', {
          name: line.materialName,
        })}
        onPress={() => {
          haptics.selection()
          onToggle(line.key)
        }}
        unstable_pressDelay={ROW_PRESS_DELAY_MS}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 2,
            borderColor: circleBorder,
            backgroundColor: circleBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {status === 'match' ? <Check size={15} color="#fff" strokeWidth={3} aria-hidden /> : null}
          {diff ? (
            <Text weight="bold" size={14} style={{ color: '#fff', lineHeight: 16 }}>
              !
            </Text>
          ) : null}
          {zero ? <X size={15} color="#fff" strokeWidth={3} aria-hidden /> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onOpen(line.key)}
        unstable_pressDelay={ROW_PRESS_DELAY_MS}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 10,
          paddingLeft: 3,
          paddingRight: 16,
          alignSelf: 'stretch',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        {content}
      </Pressable>
    </View>
  )
}

export const ReceiveRow = memo(ReceiveRowImpl)
