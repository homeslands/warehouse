import { PackageMinus, PackagePlus } from '../icons'
import { Fragment, memo, type ReactNode } from 'react'
import { Pressable, Text as RNText, StyleSheet, View } from 'react-native'

import { useTheme } from '../../theme/useTheme'
import { ROW_PRESS_DELAY_MS } from '../press'
import { Text } from '../Text'
import { guardSwipePress, useSwipeDeleteA11y } from './SwipeToDelete'

/** Lề trái của dòng — kẻ mảnh giữa các dòng lùi bằng đây (mockup `apple-rows-v3` A). */
const ROW_INSET = 16
/** Ô icon đầu thẻ (vuông bo) + khoảng cách tới chữ. */
const ICON_BOX = 36
const ICON_GAP = 12

/** Sắc chữ của một đoạn trên dòng tóm tắt: `normal` = màu của ô (không tô). */
export type SummaryTone = 'normal' | 'muted' | 'warning' | 'destructive'
export type SummarySegment = { text: string; tone: SummaryTone }

/**
 * Nội dung dòng vật tư chỉ đọc (spec wizard-apple §6) — hàm thuần của từng loại phiếu dựng
 * (`exportLineSummary` / `importLineSummary`), bước 2 và bước 3 cùng vẽ: dòng 2 một chuỗi một sắc; dòng 3
 * các đoạn nối " · " (phần xám rồi cảnh báo); `missing` = dòng có mục "còn thiếu" của bước 2; `a11y` =
 * nhãn đọc của cả dòng (tên + số × giá / thiếu gì + thành tiền + dòng 3).
 */
export type LineSummary = {
  line2: string
  line2Tone: 'normal' | 'muted' | 'warning'
  line3: SummarySegment[]
  amount: string
  amountTone: 'normal' | 'muted' | 'warning'
  missing: boolean
  a11y: string
}

/** Nhãn đọc của cả dòng: tên, dòng 2, thành tiền (`null` = "—", không đọc), các đoạn dòng 3. */
export function lineSummaryA11y(
  name: string,
  line2: string,
  amount: string | null,
  line3: readonly SummarySegment[],
): string {
  return [name, line2, amount, ...line3.map((s) => s.text)].filter(Boolean).join(', ')
}

/** Số ký tự tối đa của phần trích ghi chú trên dòng 3. */
const NOTE_EXCERPT_MAX = 40

/**
 * Phần trích ghi chú của dòng cho cuối dòng 3 (bước 2 / bước 3): DÒNG ĐẦU của ghi chú, bỏ khoảng trắng
 * thừa, quá `NOTE_EXCERPT_MAX` ký tự thì cắt + "…" (một dòng, không bao giờ phình dòng). Trống → `null`.
 */
export function noteExcerpt(note: string | null | undefined): string | null {
  const first = (note ?? '').trim().split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? ''
  if (!first) return null
  const chars = Array.from(first)
  return chars.length > NOTE_EXCERPT_MAX
    ? `${chars.slice(0, NOTE_EXCERPT_MAX).join('').trimEnd()}…`
    : first
}

/**
 * Các đoạn chữ lồng (`Text` của react-native — chỉ đổi MÀU, cỡ lấy của ô `LineSummaryRow` bao ngoài),
 * nối bằng " · " xám. Dùng cho `amount` / `line2` / `line3` của `LineSummaryRow`.
 */
export function SummaryText({ segments }: { segments: readonly SummarySegment[] }) {
  const { colors } = useTheme()
  const color = (tone: SummaryTone) =>
    tone === 'muted'
      ? colors.mutedForeground
      : tone === 'warning'
        ? colors.warningText
        : tone === 'destructive'
          ? colors.destructiveText
          : undefined
  return (
    <>
      {segments.map((s, i) => (
        <Fragment key={i}>
          {i > 0 ? <RNText style={{ color: colors.mutedForeground }}>{' · '}</RNText> : null}
          <RNText style={color(s.tone) ? { color: color(s.tone) } : undefined}>{s.text}</RNText>
        </Fragment>
      ))}
    </>
  )
}

export type LineSummaryRowProps = {
  /** Dòng 1 trái: tên vật tư (17, một dòng cắt đuôi). */
  title: string
  /** Cột phải, giữa thẻ theo chiều dọc: thành tiền (16 đậm). Chuỗi → chữ mặc định; node → màn tự tô. */
  amount: ReactNode
  /** Dòng 2 (15): "12 bình × 12.000 đ" / chữ cam "Chưa nhập …". */
  line2: ReactNode
  /** Dòng 3 (14, `mutedForeground`): mã · còn n · lô / HSD, rồi cảnh báo của dòng. */
  line3: ReactNode
  /** Icon đầu thẻ: `import` = hộp "+", `export` = hộp "−". Không truyền → không có icon. */
  icon?: 'import' | 'export'
  /** Dòng còn thiếu (`LineSummary.missing`): ô icon tô cam. */
  warning?: boolean
  /** Dòng đầu khối: bo trên, không kẻ trên. */
  first: boolean
  /** Dòng cuối khối: bo dưới. */
  last: boolean
  onPress?: () => void
  /** Có `onPress` mà đang khoá (đang ghi phiếu): không bấm được, a11y `disabled`. */
  disabled?: boolean
  /** Nhãn đọc của cả dòng (tên + số × giá + thiếu gì) — màn ghép sẵn đã dịch. */
  accessibilityLabel: string
  testID?: string
}

/**
 * Một dòng vật tư CHỈ ĐỌC của bước 2 (spec wizard-apple §6): chạm cả dòng → sheet sửa (qua
 * `guardSwipePress`: đang vuốt / có thẻ đang mở nút xoá thì không mở). Bố cục: [ô icon 36 `icon`] [tên 16
 * đậm / số × giá 14 / mã · HSD 13 xám] [thành tiền 16 đậm, giữa thẻ theo chiều dọc]; không có mũi tên. Nền `card`, lùi trái 16, kẻ mảnh giữa dòng
 * (lùi theo chữ khi có icon); bo đầu / cuối khối theo `first` / `last` (dòng trong FlatList). Nhấn → nền
 * `cellPressed`. Có `onPress` → một phần tử a11y `button`; không → phần tử a11y thường.
 *
 * Mỗi ô (`amount`, `line2`, `line3`) được bọc trong một `Text` mang cỡ / màu của ô: truyền chuỗi, hoặc
 * các đoạn chữ lồng chỉ đổi MÀU (`SummaryText`, hay `Text` của react-native — `Text` của shared/ui tự đặt
 * cỡ 15). Nằm trong `SwipeToDelete`: dòng mang thao tác a11y "Xoá" của khung vuốt.
 */
export const LineSummaryRow = memo(function LineSummaryRow({
  title,
  amount,
  line2,
  line3,
  icon,
  warning = false,
  first,
  last,
  onPress,
  disabled = false,
  accessibilityLabel,
  testID,
}: LineSummaryRowProps) {
  const { colors, radius } = useTheme()
  const swipeA11y = useSwipeDeleteA11y()
  const top = first ? radius.groupLarge : 0
  const bottom = last ? radius.groupLarge : 0
  const frame = {
    minHeight: 44,
    paddingVertical: 12,
    paddingLeft: ROW_INSET,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ICON_GAP,
    borderTopLeftRadius: top,
    borderTopRightRadius: top,
    borderBottomLeftRadius: bottom,
    borderBottomRightRadius: bottom,
  } as const
  const Glyph = icon === 'export' ? PackageMinus : PackagePlus

  // Thứ bậc chữ: tên 16 đậm vừa / thành tiền 16 đậm → số × giá 14 thường → mã · HSD 13 xám.
  const content = (
    <>
      {first ? null : (
        <View
          testID={testID ? `${testID}-hairline` : undefined}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            left: icon ? ROW_INSET + ICON_BOX + ICON_GAP : ROW_INSET,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.separator,
          }}
        />
      )}
      {icon ? (
        <View
          testID={testID ? `${testID}-icon` : undefined}
          style={{
            width: ICON_BOX,
            height: ICON_BOX,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: warning ? colors.warningSoft : colors.accentSoft,
          }}
        >
          <Glyph
            size={20}
            strokeWidth={2}
            color={warning ? colors.warningText : colors.accent}
            aria-hidden
          />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text size={16} weight="semibold" numberOfLines={1}>
          {title}
        </Text>
        <Text numeric size={14} style={{ marginTop: 3 }}>
          {line2}
        </Text>
        <Text muted size={13} numberOfLines={1} style={{ marginTop: 2 }}>
          {line3}
        </Text>
      </View>
      {/* Thành tiền: cột phải, giữa thẻ theo chiều dọc. */}
      <Text numeric weight="semibold" size={16} style={{ flexShrink: 0, maxWidth: '45%' }}>
        {amount}
      </Text>
    </>
  )

  if (!onPress) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={accessibilityLabel}
        {...swipeA11y}
        style={[frame, { backgroundColor: colors.card }]}
      >
        {content}
      </View>
    )
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      {...swipeA11y}
      // Chỉ tô nền "đang chạm" khi ngón tay giữ yên một nhịp: vuốt xoá / cuộn danh sách không nháy thẻ.
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      onPress={() => guardSwipePress(onPress)}
      style={({ pressed }) => [
        frame,
        { backgroundColor: pressed ? colors.cellPressed : colors.card },
      ]}
    >
      {content}
    </Pressable>
  )
})
