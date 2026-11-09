import { Stack } from 'expo-router'
import type { ReactNode, Ref } from 'react'
import { Platform, type ScrollViewInstance } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { FormScrollView } from './FormScrollView'
import { Screen } from './Screen'
import { SectionFooter } from './SectionFooter'
import type { DoneState } from './SheetHeaderButton'
import { sheetHeaderOptions } from './sheetHeaderOptions'

export type SheetScaffoldProps = {
  title: string
  cancelLabel: string
  onCancel: () => void
  /** Không truyền `onDone` → sheet chỉ có ✕. */
  doneLabel?: string
  onDone?: () => void
  doneState?: DoneState
  /** ✓ hiện nhưng khoá (chưa có gì để lưu). */
  doneDisabled?: boolean
  children: ReactNode
  /** Chú thích nhỏ cuối nội dung. */
  footer?: string
  testID?: string
  /** Ref của vùng cuộn (vd cuộn ô tìm vào tầm nhìn). */
  scrollRef?: Ref<ScrollViewInstance>
  /** Nội dung ghim dưới vùng cuộn (vd nút "Thêm n vật tư"), nổi lên trên bàn phím. */
  bottom?: ReactNode
  /** Nền `grouped` (xám kiểu Cài đặt iOS) cho sheet gồm các nhóm thẻ. */
  grouped?: boolean
  /** Cuộn tới gần cuối (còn ≤ 400pt) — vd tải trang danh sách tiếp theo. Gọi lặp khi còn cuộn: màn tự chặn. */
  onEndReached?: () => void
}

/** Còn cách đáy nội dung bao nhiêu pt thì coi là "tới cuối". */
const END_THRESHOLD = 400

/**
 * Thân chuẩn của MỌI bottom sheet. Sheet là route trình bày như `/switch-warehouse` và có Stack lồng
 * riêng (`SheetStackLayout`) nên header là header NATIVE: màn chỉ khai options (tiêu đề, ✕, ✓) qua
 * `<Stack.Screen options>` — xem `sheetHeaderOptions`. Phần thân: cuộn, lề 16, tránh bàn phím và đưa ô
 * đang nhập lên trên bàn phím (`FormScrollView`; iOS formSheet: KAV cũ tính theo khung trong sheet nên
 * thiếu đúng khoảng sheet cách đỉnh màn → ô cuối bị che). iOS: nền trong suốt để hệ thống vẽ nền kính
 * của sheet; Android: nền thẻ.
 */
export function SheetScaffold({
  children,
  footer,
  testID,
  title,
  cancelLabel,
  doneLabel,
  onCancel,
  onDone,
  doneState,
  doneDisabled,
  scrollRef,
  bottom,
  grouped = false,
  onEndReached,
}: SheetScaffoldProps) {
  const { colors } = useTheme()
  return (
    // Header native lo mép trên; giữ hai bên + đáy (thanh home).
    <Screen
      tone={grouped ? 'grouped' : 'sheet'}
      edges={['left', 'right', 'bottom']}
      testID={testID}
    >
      <Stack.Screen
        options={sheetHeaderOptions({
          title,
          cancelLabel,
          doneLabel,
          onCancel,
          onDone,
          doneState,
          doneDisabled,
          tint: colors.primary,
          spinner: colors.foreground,
        })}
      />
      <FormScrollView
        ref={scrollRef}
        bottom={bottom}
        testID={testID ? `${testID}-scroll` : undefined}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
        onScroll={
          onEndReached
            ? ({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
                if (
                  contentOffset.y + layoutMeasurement.height >=
                  contentSize.height - END_THRESHOLD
                )
                  onEndReached()
              }
            : undefined
        }
      >
        {children}
        {footer ? <SectionFooter>{footer}</SectionFooter> : null}
      </FormScrollView>
    </Screen>
  )
}
