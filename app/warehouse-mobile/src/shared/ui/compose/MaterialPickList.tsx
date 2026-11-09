import { Check } from '../icons'
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'

import { ROW_PRESS_DELAY_MS } from '../press'
import { Text } from '../Text'
import { planSelectAll } from './pick-select-all'

/**
 * Một dòng của danh sách chọn nhiều vật tư. `exists` = đã có trên phiếu ("đã có", không tick được);
 * `locked` = không chọn được vì lý do khác (`lockedLabel`, vd "Chưa có đơn vị"; không có nhãn thì chỉ
 * nhạt đi, vd đang lưu).
 */
export type PickItem = {
  id: string
  name: string
  code: string
  detail: string | null
  detailTone?: 'muted' | 'warning'
  /** Dòng phụ thứ ba (xám, một dòng cắt đuôi), vd "Bên bán: …". */
  subtitle?: string | null
  state: 'pickable' | 'exists' | 'locked'
  lockedLabel?: string
  /** Nhãn đọc cho trình đọc màn hình, đã dịch; không có thì ghép `tên, mã, chi tiết, nhãn`. */
  accessibilityLabel?: string
}

export type MaterialPickListProps = {
  items: readonly PickItem[]
  checked: ReadonlySet<string>
  onToggle: (id: string) => void
  /** Số dòng còn tick thêm được; ≤ 0 thì dòng chưa tick bị khoá và hiện `capacityLabel`. */
  capacityLeft: number
  capacityLabel: string
  /**
   * Bật "Chọn tất cả / Bỏ chọn tất cả" (hàng dưới `header`): màn nhận danh sách id cần thêm (`select`)
   * hoặc bỏ tick; chỉ tác động các dòng đang hiện (`planSelectAll`).
   */
  onSelectMany?: (ids: string[], select: boolean) => void
  /** Số đã tick hiện ở hàng "Chọn tất cả" (mặc định `checked.size`). */
  selectedCount?: number
  /** Phía trên các dòng (ô tìm, câu "Hiện 50/n…"). */
  header?: ReactNode
  /** Hiện thay cho các dòng khi `items` rỗng. */
  empty?: ReactNode
  testID?: string
}

/**
 * Danh sách chọn NHIỀU vật tư: mỗi vật tư một THẺ riêng (bo 16, cách nhau 8, không kẻ), `checkbox` có ô tick
 * tròn; đã tick → viền accent. Chạm: KHÔNG nháy nền (thẻ chỉ thu nhẹ 0,98 khi GIỮ yên ≥ 130ms — vuốt cuộn không làm thẻ nảy), ô tick nảy nhẹ khi đổi
 * (Reduce Motion: không thu, không nảy). Chọn xong do màn gọi tự xử lý.
 */
export function MaterialPickList({
  items,
  checked,
  onToggle,
  capacityLeft,
  capacityLabel,
  onSelectMany,
  selectedCount,
  header,
  empty,
  testID,
}: MaterialPickListProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  const full = capacityLeft <= 0
  const plan = onSelectMany ? planSelectAll(items, checked, capacityLeft) : null
  return (
    <View testID={testID} style={{ gap: 12 }}>
      {header}
      {onSelectMany && plan ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 4,
          }}
        >
          <Text numeric muted size={13}>
            {t('common:compose.pick.selected', { count: selectedCount ?? checked.size })}
          </Text>
          <Pressable
            testID="pick-select-all"
            accessibilityRole="button"
            accessibilityLabel={t(
              plan.mode === 'add'
                ? 'common:compose.pick.selectAll'
                : 'common:compose.pick.deselectAll',
            )}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            onPress={() => {
              onSelectMany(plan.ids, plan.mode === 'add')
              haptics.selection()
            }}
            style={({ pressed }) => ({
              minHeight: 44,
              minWidth: 44,
              justifyContent: 'center',
              alignItems: 'flex-end',
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Text size={15} style={{ color: colors.accent }}>
              {t(
                plan.mode === 'add'
                  ? 'common:compose.pick.selectAll'
                  : 'common:compose.pick.deselectAll',
              )}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {full ? (
        <Text size={13} accessibilityRole="alert" style={{ color: colors.destructive }}>
          {capacityLabel}
        </Text>
      ) : null}
      {items.length === 0 ? (
        empty
      ) : (
        <View style={{ gap: 8 }}>
          {items.map((m) => {
            const isChecked = checked.has(m.id)
            const locked = m.state !== 'pickable' || (!isChecked && full)
            const hint =
              m.state === 'exists'
                ? t('common:compose.pick.exists')
                : m.state === 'locked'
                  ? (m.lockedLabel ?? null)
                  : null
            return (
              <Pressable
                key={m.id}
                testID={`pick-row-${m.id}`}
                accessibilityRole="checkbox"
                accessibilityLabel={
                  m.accessibilityLabel ??
                  [m.name, m.code, m.detail, m.subtitle, hint].filter(Boolean).join(', ')
                }
                accessibilityState={{ checked: isChecked, disabled: locked }}
                disabled={locked}
                // Chỉ coi là "chạm" khi ngón tay giữ yên một nhịp (như UIScrollView `delaysContentTouches`):
                // vuốt cuộn danh sách thì thẻ không thu lại rồi bật ra.
                unstable_pressDelay={ROW_PRESS_DELAY_MS}
                onPress={() => {
                  onToggle(m.id)
                  haptics.selection()
                }}
                style={({ pressed }) => ({
                  minHeight: 64,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: 16,
                  backgroundColor: colors.card,
                  // Viền luôn có (trong suốt khi chưa tick) để tick không làm thẻ nhảy kích thước.
                  borderWidth: 1.5,
                  borderColor: isChecked ? colors.accent : 'transparent',
                  transform: [{ scale: pressed && !reduced ? 0.98 : 1 }],
                })}
              >
                <CheckCircle checked={isChecked} locked={locked} />
                <View
                  style={{ flex: 1, minWidth: 0, gap: 3, opacity: locked && !isChecked ? 0.55 : 1 }}
                >
                  <Text size={16} weight="semibold" numberOfLines={2}>
                    {m.name}
                  </Text>
                  <Text muted size={13} numberOfLines={1}>
                    <Text code muted size={13}>
                      {m.code}
                    </Text>
                    {hint ? (
                      <>
                        {' · '}
                        <Text muted size={13}>
                          {hint}
                        </Text>
                      </>
                    ) : null}
                  </Text>
                  {m.subtitle ? (
                    <Text muted size={13} numberOfLines={1}>
                      {m.subtitle}
                    </Text>
                  ) : null}
                </View>
                {m.detail ? (
                  <Text
                    numeric
                    muted={m.detailTone !== 'warning'}
                    size={13}
                    numberOfLines={2}
                    style={{
                      maxWidth: '36%',
                      textAlign: 'right',
                      color: m.detailTone === 'warning' ? colors.warningText : undefined,
                    }}
                  >
                    {m.detail}
                  </Text>
                ) : null}
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )
}

/** Ô tick tròn 24pt: đã tick nền `accent` + dấu ✓ (nảy nhẹ khi vừa tick); chưa tick viền mờ; khoá thì nhạt. */
function CheckCircle({ checked, locked }: { checked: boolean; locked: boolean }) {
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  const first = useRef(true)
  useEffect(() => {
    // Lần vẽ đầu không nảy; chỉ khi người dùng vừa tick / bỏ tick.
    if (first.current) {
      first.current = false
      return
    }
    if (reduced) return
    scale.set(
      withSequence(
        withTiming(0.82, { duration: 70 }),
        withSpring(1, { damping: 12, stiffness: 320 }),
      ),
    )
  }, [checked, reduced, scale])
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }))
  return (
    <Animated.View
      style={[
        {
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: checked ? colors.accent : undefined,
          borderWidth: checked ? 0 : 1.5,
          borderColor: colors.mutedForeground,
          opacity: locked && !checked ? 0.4 : 1,
        },
        pop,
      ]}
    >
      {checked ? (
        <Check size={15} strokeWidth={3} color={colors.accentForeground} aria-hidden />
      ) : null}
    </Animated.View>
  )
}
