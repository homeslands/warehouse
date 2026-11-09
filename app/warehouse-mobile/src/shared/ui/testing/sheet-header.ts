/**
 * Test màn sheet đơn lẻ (không có navigator): header native của sheet là `options` khai qua
 * `<Stack.Screen options>` (xem `SheetScaffold`). Mock `expo-router` bằng `mockSheetStack` để ghi lại
 * options lần render gần nhất, rồi đọc/bấm ✕ ✓ bằng các hàm dưới đây (jest chạy như iOS: mục thanh gốc
 * `unstable_headerLeftItems` / `unstable_headerRightItems`).
 *
 *   jest.mock('expo-router', () => ({
 *     Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
 *   }))
 */
import { act } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'

type ButtonItem = Extract<NativeStackHeaderItem, { type: 'button' }>

let latest: NativeStackNavigationOptions = {}

export const mockSheetStack = {
  Screen: ({ options }: { options?: NativeStackNavigationOptions }) => {
    if (options) latest = options
    return null
  },
}

const itemsOf = (fn: NativeStackNavigationOptions['unstable_headerLeftItems']) =>
  fn?.({ tintColor: undefined, canGoBack: false } as never) ?? []

/** Header native hiện tại của sheet: tiêu đề, nút ✕, nút ✓ (không có khi đang quay), đang quay? */
export function sheetHeader() {
  const left = itemsOf(latest.unstable_headerLeftItems)
  const right = itemsOf(latest.unstable_headerRightItems)
  return {
    title: latest.title,
    cancel: left.find((i): i is ButtonItem => i.type === 'button'),
    done: right.find((i): i is ButtonItem => i.type === 'button'),
    busy: right.some((i) => i.type === 'custom'),
  }
}

/** Bấm như người dùng: mục bị `disabled` thì hệ thống không gọi `onPress`. */
async function press(item: ButtonItem | undefined, name: string) {
  if (!item) throw new Error(`Header sheet không có nút ${name}`)
  if (item.disabled) return
  await act(async () => item.onPress())
}

export const pressSheetCancel = () => press(sheetHeader().cancel, '✕')
export const pressSheetDone = () => press(sheetHeader().done, '✓')

/** Xoá options đã ghi (gọi trong `beforeEach` khi file có cả màn không phải sheet). */
export function resetSheetHeader() {
  latest = {}
}
