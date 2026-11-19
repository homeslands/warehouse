import { setUpTests } from 'react-native-reanimated'

// Reanimated 4 trong jest: thêm matcher `toHaveAnimatedStyle` / `toHaveAnimatedProps`.
setUpTests()

// RN 0.88 cảnh báo "InputAccessoryView is deprecated" (warnOnce, khi truy cập export) — đã chốt giữ
// `InputAccessoryView` cho thanh "Xong" (`KeyboardDoneBar`, plan form-wizard Task 1). Bỏ ĐÚNG câu này
// khỏi output test để mọi cảnh báo khác vẫn hiện (màn bước 2 phiếu xuất, routing.test vẽ thanh này).
const warn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('InputAccessoryView is deprecated')) return
  warn(...args)
}

// Cờ tạm checklist (xem jest.setup.ts): mỗi test bắt đầu với cờ BẬT.
afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/features/receive-checklist/model/flags').__setChecklistEnabled(true)
})

// Camera quét: "giữ yên mới nhận" (`scanTiming.dwellMs` 350 ms) tắt trong test — một sự kiện quét là nhận
// (test màn hình bắn một lần). Test riêng của luật giữ yên (`BarcodeCamera.test`) tự đặt giá trị thật.
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { scanTiming, DEFAULT_SCAN_TIMING } = require('@/features/scan-material/scan-timing')
  scanTiming.dwellMs = 0
  scanTiming.gapMs = DEFAULT_SCAN_TIMING.gapMs
  scanTiming.repeatHintMs = 0
})
