// Global jest setup. Later tasks add mocks here (e.g. SecureStore).
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import 'react-native-gesture-handler/jestSetup'

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)

// SecureStore native: thay bằng mock trong bộ nhớ (mỗi test tự đặt lại giá trị trả về khi cần).
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}))

// `getEnv()` ném khi thiếu biến; test dùng URL giả.
process.env.EXPO_PUBLIC_API_BASE_URL ??= 'http://localhost:8085/api/v1'

// Haptics là native: thay bằng hàm giả để test khẳng định được lúc nào rung.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

// Camera là native: `CameraView` thành View có testID `camera-view` (bắn quét bằng
// `fireEvent(view, 'barcodeScanned', { data })`); quyền camera điều khiển qua `__permission`:
// `current` là trạng thái ban đầu, `afterRequest` là kết quả khi bấm xin quyền.
jest.mock('expo-camera', () => {
  const React = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  const granted = { granted: true, canAskAgain: true, status: 'granted', expires: 'never' }
  const permission = {
    granted,
    current: granted as object | null,
    afterRequest: granted as object,
    request: jest.fn(),
    reset() {
      this.current = granted
      this.afterRequest = granted
      this.request.mockClear()
    },
  }
  return {
    __permission: permission,
    useCameraPermissions: () => {
      const [state, setState] = React.useState(permission.current)
      const request = async () => {
        permission.request()
        setState(permission.afterRequest)
        return permission.afterRequest
      }
      return [state, request, request]
    },
    CameraView: (props: object) => React.createElement(View, { testID: 'camera-view', ...props }),
  }
})

// Liquid Glass là native (iOS 26+): `GlassView` thành View `testID="glass-view"`.
// `isLiquidGlassAvailable` GIỮ hành vi thật của jest-expo (expo-router cũng gọi nó để chọn font/nền
// header — ép false làm đổi header của mọi test); test của nút nổi tự `mockReturnValue(true|false)`
// rồi trả lại giá trị gốc.
jest.mock('expo-glass-effect', () => {
  const React = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  const actual = jest.requireActual('expo-glass-effect')
  return {
    ...actual,
    isLiquidGlassAvailable: jest.fn(actual.isLiquidGlassAvailable),
    isGlassEffectAPIAvailable: jest.fn(actual.isGlassEffectAPIAvailable),
    GlassView: (props: object) => React.createElement(View, { testID: 'glass-view', ...props }),
  }
})

// react-native-gesture-handler (vuốt để xoá thẻ vật tư): mock module native theo docs testing của RNGH
// (import ở đầu file, xem phần RNGH cuối file).
// RNGH nạp bindings UI runtime của worklets lúc import; resolver Reanimated của jest trỏ worklets sang
// bản web (`getUIRuntimeHolder` ném lỗi) → dùng bản web no-op của chính RNGH cho bước này.
// (jest đọc `main` của gói = `lib/module`; `jestSetup.js` của RNGH mock cả `src/` lẫn `lib/module/`.)
jest.mock(
  'react-native-gesture-handler/lib/module/handlers/gestures/installUIRuntimeBindings',
  () =>
    jest.requireActual(
      'react-native-gesture-handler/lib/module/handlers/gestures/installUIRuntimeBindings.web',
    ),
)
// `ReanimatedSwipeable` (vuốt để xoá thẻ): cử chỉ không chạy được trong jest, và cử chỉ v3 của RNGH gắn
// listener lên shared value qua UI runtime (bản worklets web của jest không có `addListener`) → thay bằng
// khung tĩnh: vẽ nút hành động bên phải (`renderRightActions`) + nội dung, `ref` có các hàm no-op. Test
// xoá dùng thao tác a11y "delete" của `SwipeToDelete`.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  const methods = { close() {}, openLeft() {}, openRight() {}, reset() {} }
  const value = (v: number) => ({ value: v, get: () => v, set() {} })
  const Swipeable = ({
    ref,
    testID,
    children,
    renderRightActions,
    containerStyle,
  }: {
    ref?: { current: unknown } | ((m: unknown) => void)
    testID?: string
    children?: unknown
    renderRightActions?: (p: unknown, t: unknown, m: unknown) => unknown
    containerStyle?: unknown
  }) => {
    React.useImperativeHandle(ref, () => methods)
    return React.createElement(
      View,
      { testID, style: containerStyle },
      renderRightActions?.(value(0), value(0), methods) ?? null,
      React.createElement(View, null, children),
    )
  }
  return { __esModule: true, default: Swipeable, SwipeDirection: { LEFT: 'left', RIGHT: 'right' } }
})

// Cờ tạm `RECEIVE_CHECKLIST_ENABLED` (features/receive-checklist/model/flags.ts): test chạy với cờ BẬT
// (checklist đầy đủ); test cờ tắt gọi `setChecklistEnabled(false)` (đặt lại về bật sau mỗi test).
jest.mock('@/features/receive-checklist/model/flags', () => {
  const state = { enabled: true }
  return {
    __esModule: true,
    get RECEIVE_CHECKLIST_ENABLED() {
      return state.enabled
    },
    __setChecklistEnabled: (v: boolean) => {
      state.enabled = v
    },
  }
})
