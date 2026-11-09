/**
 * Test các lối "lùi" của người dùng trên Stack THẬT (`renderRouter`):
 * - `stubAndroidBack()` — jest chạy như iOS nên `BackHandler` là no-op; hàm này ghi lại mọi listener
 *   `hardwareBackPress` (cả của app lẫn của react-navigation) và `press()` gọi chúng như Android: listener
 *   đăng ký SAU chạy TRƯỚC, listener trả `true` thì dừng (đã xử lý); chạy trong `act` vì back có thể
 *   điều hướng. Gọi TRƯỚC khi render; `restore()` khi dọn.
 * - `headerConfigs()` — prop của `RNSScreenStackHeaderConfig` từng màn trong cây theo thứ tự Stack (màn
 *   trên cùng là phần tử cuối): `hideBackButton` (nút back gốc ẩn), `headerLeftBarButtonItems` (mục trái
 *   iOS — vd ✕ `title: 'Đóng'`).
 */
import { act, screen } from '@testing-library/react-native'
import { BackHandler } from 'react-native'

type Handler = () => boolean | null | undefined

export function stubAndroidBack() {
  const handlers: Handler[] = []
  const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    handlers.push(handler as Handler)
    return {
      remove: () => {
        const i = handlers.indexOf(handler as Handler)
        if (i >= 0) handlers.splice(i, 1)
      },
    }
  })
  return {
    /** Bấm back phần cứng: `true` nếu có listener nhận xử lý (như Android, không thì app thoát). */
    press: async (): Promise<boolean> => {
      let handled = false
      await act(async () => {
        for (let i = handlers.length - 1; i >= 0 && !handled; i--) handled = !!handlers[i]!()
      })
      return handled
    },
    count: () => handlers.length,
    restore: () => spy.mockRestore(),
  }
}

export type HeaderConfig = {
  hideBackButton?: boolean
  headerLeftBarButtonItems?: { title?: string; disabled?: boolean }[]
}

export function headerConfigs(): HeaderConfig[] {
  return screen.container
    .queryAll((n) => n.type === 'RNSScreenStackHeaderConfig')
    .map((n) => n.props as HeaderConfig)
}
