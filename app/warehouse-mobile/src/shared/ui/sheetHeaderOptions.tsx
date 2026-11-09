import type { NativeStackNavigationOptions } from 'expo-router'
import { ActivityIndicator, Platform } from 'react-native'

import { SheetHeaderButton, type DoneState } from './SheetHeaderButton'

export type SheetHeaderConfig = {
  title: string
  cancelLabel: string
  onCancel: () => void
  /** Không truyền `onDone` → sheet chỉ có ✕ (vd sheet quét mã: đọc được mã là tự đóng). */
  doneLabel?: string
  onDone?: () => void
  doneState?: DoneState
  /** ✓ hiện nhưng khoá (vd chưa có thay đổi để lưu). */
  doneDisabled?: boolean
  /** Màu nhấn của nút ✓ (iOS: nút kính "prominent" tô màu này). */
  tint: string
  /** Màu vòng quay khi đang ghi (iOS: mục `custom` cạnh nút ✕). */
  spinner: string
}

const noop = () => {}

/**
 * Options cho header NATIVE của một sheet (Stack lồng trong sheet, xem `SheetStackLayout`):
 * - iOS 26/27: ✕ là mục thanh gốc (SF Symbol `xmark`), ✓ là mục gốc `variant: 'prominent'` (hệ thống
 *   vẽ nút kính tô màu nhấn), đang ghi thì ✓ thay bằng vòng quay (mục `custom`). Thành công: ✓ giữ
 *   nguyên (không bấm được nữa) tới khi sheet đóng. Mục gốc không animate được nên bỏ hiệu ứng lắc khi
 *   lỗi — còn rung lỗi + báo lỗi (Alert / dưới form).
 * - Android: nút tròn `SheetHeaderButton` qua `headerLeft`/`headerRight`.
 * ✕ khoá khi đang ghi hoặc vừa xong (sheet sắp tự đóng).
 *
 * LƯU Ý: `unstable_headerLeftItems` / `unstable_headerRightItems` là API chưa ổn định (xem CLAUDE.md).
 */
export function sheetHeaderOptions({
  title,
  cancelLabel,
  doneLabel,
  onCancel,
  onDone,
  doneState = 'idle',
  doneDisabled = false,
  tint,
  spinner,
}: SheetHeaderConfig): NativeStackNavigationOptions {
  const locked = doneState !== 'idle'
  const done = locked || doneDisabled || !onDone ? noop : onDone
  const label = doneLabel ?? ''

  if (Platform.OS !== 'ios') {
    return {
      title,
      headerTitleAlign: 'center',
      headerLeft: () => (
        <SheetHeaderButton kind="cancel" label={cancelLabel} onPress={onCancel} disabled={locked} />
      ),
      headerRight: onDone
        ? () => (
            <SheetHeaderButton
              kind="done"
              label={label}
              onPress={done}
              disabled={locked || doneDisabled}
              busy={doneState === 'busy'}
            />
          )
        : undefined,
    }
  }

  return {
    title,
    unstable_headerLeftItems: () => [
      {
        type: 'button',
        label: cancelLabel,
        accessibilityLabel: cancelLabel,
        icon: { type: 'sfSymbol', name: 'xmark' },
        onPress: onCancel,
        disabled: locked,
      },
    ],
    unstable_headerRightItems: () =>
      !onDone
        ? []
        : doneState === 'busy'
          ? [
              {
                type: 'custom',
                element: (
                  <ActivityIndicator
                    testID="sheet-done-busy"
                    accessibilityLabel={label}
                    color={spinner}
                  />
                ),
              },
            ]
          : [
              {
                type: 'button',
                label,
                accessibilityLabel: label,
                icon: { type: 'sfSymbol', name: 'checkmark' },
                variant: 'prominent',
                tintColor: tint,
                onPress: done,
                disabled: doneDisabled,
              },
            ],
  }
}
