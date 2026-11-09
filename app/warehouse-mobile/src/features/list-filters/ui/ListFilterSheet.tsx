import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, type ScrollViewInstance } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useTheme } from '@/shared/theme/useTheme'
import { SheetScaffold, Text } from '@/shared/ui'

import { useActiveFilterLabels, useListViewer } from '../labels'
import type { ChipFilterStore } from '../store'
import { PersonFilterSection } from './PersonFilterSection'
import { TimeFilterSection } from './TimeFilterSection'

/** Chừa trên ô tìm khi cuộn nó lên đầu vùng nhìn. */
const REVEAL_MARGIN = 8

/**
 * Thân sheet Lọc của một danh sách phiếu (route từng tab bọc mỏng quanh nó), MỘT trang (kiểu Lời nhắc iOS): mỗi bộ
 * lọc là một thẻ có công tắc, BẬT là áp dụng ngay (giá trị mặc định) và mở lựa chọn ngay trong thẻ:
 * "Thời gian", "Người lập" (khi hồ sơ có `userSlug` hoặc có `USER_READ`), "Người xác nhận" (CHỈ khi có
 * `USER_READ`). Chọn là áp dụng (không ✓, không trang con); chỉ có ✕. "Xoá lọc" (chỉ khi đang lọc) tắt
 * mọi công tắc, giữ ô tìm + trạng thái. Chạm ô tìm người → cuộn ô tìm lên đầu vùng nhìn (nấc nửa màn
 * + bàn phím).
 */
export function ListFilterSheet({
  store,
  title,
  extra,
  extraActive = false,
  onClearExtra,
  testID,
}: {
  /** Store của tab (chứa lát bộ lọc chip). */
  store: ChipFilterStore
  title: string
  /** Section riêng của tab (vd. "Loại" của tab Xuất), hiện sau các section chip, trước "Xoá lọc". */
  extra?: ReactNode
  /** Bộ lọc riêng của tab đang bật → vẫn hiện "Xoá lọc". */
  extraActive?: boolean
  /** "Xoá lọc" gọi thêm hàm này (cùng `clearChips()`) để tab xoá bộ lọc riêng. */
  onClearExtra?: () => void
  testID: string
}) {
  const { t } = useTranslation(['importForms', 'common'])
  const { colors } = useTheme()
  const close = useCloseSheet()
  const viewer = useListViewer()
  const time = store((s) => s.time)
  const requester = store((s) => s.requester)
  const approver = store((s) => s.approver)
  const labels = useActiveFilterLabels(viewer, { time, requester, approver })
  const reduced = useReducedMotion()
  const scrollRef = useRef<ScrollViewInstance>(null)
  // "Xoá lọc" dựng lại các thẻ: bỏ cả chế độ "Người khác" đang chờ chọn (chỉ nằm trong thẻ).
  const [generation, setGeneration] = useState(0)

  const reveal = (y: number) =>
    scrollRef.current?.scrollTo({ y: Math.max(0, y - REVEAL_MARGIN), animated: !reduced })

  return (
    <SheetScaffold
      testID={testID}
      title={title}
      cancelLabel={t('common:cancel')}
      onCancel={close}
      // Bộ lọc áp dụng ngay khi chọn; ✓ chỉ là "xong" — đóng sheet.
      doneLabel={t('common:done')}
      onDone={close}
      scrollRef={scrollRef}
    >
      <TimeFilterSection store={store} key={`time-${generation}`} />
      {viewer.userSlug || viewer.canReadUsers ? (
        <PersonFilterSection
          store={store}
          key={`requester-${generation}`}
          role="requester"
          viewer={viewer}
          onRevealSearch={reveal}
        />
      ) : null}
      {viewer.canReadUsers ? (
        <PersonFilterSection
          store={store}
          key={`approver-${generation}`}
          role="approver"
          viewer={viewer}
          onRevealSearch={reveal}
        />
      ) : null}
      {extra}
      {labels.active || extraActive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('importForms:list.filters.clear')}
          onPress={() => {
            store.getState().clearChips()
            onClearExtra?.()
            setGeneration((g) => g + 1)
          }}
          style={({ pressed }) => ({
            minHeight: 44,
            alignSelf: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text weight="medium" style={{ color: colors.destructive }}>
            {t('importForms:list.filters.clear')}
          </Text>
        </Pressable>
      ) : null}
    </SheetScaffold>
  )
}
