import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { useState, type ReactNode } from 'react'
import { AppState, Dimensions, Linking, StyleSheet } from 'react-native'
import { getAnimatedStyle as animatedStyle } from 'react-native-reanimated'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { changeLanguage, initI18n } from '@/shared/i18n'
import { Text } from '@/shared/ui'

import { ScanScreen } from './ScanScreen'

const mockScreenOptions = jest.fn()
jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options?: object }) => {
      mockScreenOptions(options)
      return null
    },
  },
}))

type Permission = { granted: boolean; canAskAgain: boolean; status: string; expires: string }
const camera = jest.requireMock('expo-camera').__permission as {
  current: Permission | null
  afterRequest: Permission
  request: jest.Mock
  get: jest.Mock
  reset: () => void
}
const DENIED_ASK: Permission = {
  granted: false,
  canAskAgain: true,
  status: 'undetermined',
  expires: 'never',
}
const DENIED_FOREVER: Permission = {
  granted: false,
  canAskAgain: false,
  status: 'denied',
  expires: 'never',
}

// Kiểu khai báo của reanimated thiếu tham số / kết quả; thực tế trả style đã áp.
const getAnimatedStyle = animatedStyle as unknown as (el: unknown) => {
  opacity: number
  transform: { scale: number }[]
}
const { width: W, height: H } = Dimensions.get('window')
const onScanned = jest.fn()
const onClose = jest.fn()

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
)

function show(props: Partial<Parameters<typeof ScanScreen>[0]> = {}) {
  return render(
    <ScanScreen
      active
      hint="Đưa mã vào khung"
      onScanned={onScanned}
      onClose={onClose}
      {...props}
    />,
    { wrapper },
  )
}

const scan = (data: string) =>
  fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data, type: 'code128' })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  camera.reset()
})

describe('ScanScreen — khung', () => {
  it('ẩn header của Stack (màn toàn màn tự vẽ ✕)', async () => {
    await show()
    expect(mockScreenOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ headerShown: false }),
    )
  })

  it('✕ ("Đóng") gọi onClose', async () => {
    await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('hiện gợi ý dưới khung ngắm', async () => {
    await show()
    expect(screen.getByText('Đưa mã vào khung')).toBeOnTheScreen()
  })

  it('không có `bottom` → không có thẻ đáy; có → thẻ hiện nội dung', async () => {
    await show()
    expect(screen.queryByTestId('scan-screen-card')).toBeNull()
    await show({ bottom: <Text>Đang tải…</Text> })
    expect(screen.getByTestId('scan-screen-card')).toBeOnTheScreen()
    expect(screen.getByText('Đang tải…')).toBeOnTheScreen()
  })

  it('testID tuỳ chỉnh đặt lên gốc màn', async () => {
    await show({ testID: 'scan-sheet' })
    expect(screen.getByTestId('scan-sheet')).toBeOnTheScreen()
  })
})

describe('ScanScreen — vùng tối', () => {
  it('Svg phủ cả màn, Path evenodd = màn + lỗ khoét bo 20 ở giữa khung', async () => {
    await show()
    const dim = screen.getByTestId('scan-dim', { includeHiddenElements: true })
    expect(dim.props.width).toBe(W)
    expect(dim.props.height).toBe(H)
    const path = screen.getByTestId('scan-dim-path', { includeHiddenElements: true })
    // react-native-svg chuyển 'evenodd' thành số 0 (nonzero = 1).
    expect(path.props.fillRule).toBe(0)
    // 0x8C000000 = đen, alpha 140/255 ≈ 0.55 (màu đã được svg xử lý thành số).
    expect(path.props.fill.payload >>> 24).toBe(140)
    const size = Math.min(Math.round(W * 0.7), 300)
    const x = (W - size) / 2
    const y = (H - size) / 2
    const d: string = path.props.d
    expect(d.startsWith(`M0 0H${W}V${H}H0Z`)).toBe(true)
    expect(d).toContain(`M${x + 20} ${y}H${x + size - 20}A20 20 0 0 1 ${x + size} ${y + 20}`)
    expect(d).toContain(`V${y + size - 20}A20 20 0 0 1 ${x + size - 20} ${y + size}`)
  })

  it('4 góc lùi ra ngoài lỗ khoét 10, bán kính góc = 20 + 10', async () => {
    await show()
    const corners = screen.getByTestId('scan-corners', { includeHiddenElements: true })
    expect(StyleSheet.flatten(corners.props.style)).toMatchObject({
      top: -10,
      left: -10,
      right: -10,
      bottom: -10,
    })
    const radii = corners.props.children.map((c: { props: { style: object[] } }) =>
      StyleSheet.flatten(c.props.style),
    )
    expect(radii.map((f: Record<string, number>) => Object.values(f).includes(30))).toEqual([
      true,
      true,
      true,
      true,
    ])
  })

  it('lỗ khoét và viền chớp cùng bán kính 20', async () => {
    await show({ flash: 'success' })
    expect(screen.getByTestId('scan-flash', { includeHiddenElements: true })).toHaveStyle({
      borderRadius: 20,
    })
  })
})

describe('ScanScreen — góc thở', () => {
  it('chạy: opacity 0.55 ↔ 1, scale 1 ↔ 1.03 (bắt đầu ở đầu thấp)', async () => {
    jest.useFakeTimers()
    try {
      await show()
      await act(async () => jest.advanceTimersByTime(16))
      const corners = () => screen.getByTestId('scan-corners', { includeHiddenElements: true })
      expect(getAnimatedStyle(corners()).opacity).toBeLessThan(0.7)
      await act(async () => jest.advanceTimersByTime(850))
      const style = getAnimatedStyle(corners())
      expect(style.opacity).toBeGreaterThan(0.9)
      expect(style.transform[0].scale).toBeGreaterThan(1.02)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('ScanScreen — quét', () => {
  it('active → đọc mã gọi onScanned (một lần); active false → chưa gắn onBarcodeScanned', async () => {
    const view = await show()
    await scan('A')
    await scan('B')
    expect(onScanned.mock.calls).toEqual([['A']])
    await view.rerender(
      <ScanScreen active={false} hint="h" onScanned={onScanned} onClose={onClose} />,
    )
    expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined()
  })

  it('onRepeat được truyền xuống camera (continuous)', async () => {
    let now = 1_000_000
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    const onRepeat = jest.fn()
    await show({ continuous: true, onRepeat })
    await scan('A')
    now += 500
    await scan('A')
    expect(onRepeat.mock.calls).toEqual([['A']])
  })

  it('continuous → nhận nhiều mã khác nhau', async () => {
    let now = 1_000_000
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    await show({ continuous: true })
    await scan('A')
    now += 1000
    await scan('B')
    expect(onScanned.mock.calls).toEqual([['A'], ['B']])
  })
})

describe('ScanScreen — chớp khung', () => {
  it('flash null → không viền chớp; success → xanh, error → đỏ', async () => {
    const view = await show()
    expect(screen.queryByTestId('scan-flash', { includeHiddenElements: true })).toBeNull()
    const props = { active: true, hint: 'h', onScanned, onClose }
    await view.rerender(<ScanScreen {...props} flash="success" />)
    expect(screen.getByTestId('scan-flash', { includeHiddenElements: true })).toHaveStyle({
      borderColor: '#30D158',
    })
    await view.rerender(<ScanScreen {...props} flash="error" />)
    expect(screen.getByTestId('scan-flash', { includeHiddenElements: true })).toHaveStyle({
      borderColor: '#FF453A',
    })
  })
})

describe('ScanScreen — đèn pin', () => {
  it('bật / tắt đèn đổi enableTorch của camera (mặc định tắt)', async () => {
    await show()
    const cam = () => screen.getByTestId('camera-view')
    expect(cam().props.enableTorch).toBe(false)
    await fireEvent.press(screen.getByRole('button', { name: 'Bật đèn pin' }))
    expect(cam().props.enableTorch).toBe(true)
    await fireEvent.press(screen.getByRole('button', { name: 'Tắt đèn pin' }))
    expect(cam().props.enableTorch).toBe(false)
  })

  it('đóng rồi mở lại → đèn tắt (trạng thái không giữ qua lần mở)', async () => {
    const view = await show()
    await fireEvent.press(screen.getByRole('button', { name: 'Bật đèn pin' }))
    expect(screen.getByTestId('camera-view').props.enableTorch).toBe(true)
    await view.unmount()
    await show()
    expect(screen.getByTestId('camera-view').props.enableTorch).toBe(false)
  })
})

describe('ScanScreen — quyền camera', () => {
  it('chưa cấp quyền → giải thích + "Cho phép camera"; không camera, không nút đèn; ✕ vẫn đóng', async () => {
    camera.current = DENIED_ASK
    await show()
    expect(screen.queryByTestId('camera-view')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Bật đèn pin' })).toBeNull()
    expect(screen.getByText('Cần quyền dùng camera')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Cho phép camera' }))
    expect(camera.request).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('camera-view')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Bật đèn pin' })).toBeOnTheScreen()
  })

  it('bị từ chối hẳn → "Mở Cài đặt" mở Cài đặt, không xin lại; ✕ vẫn đóng', async () => {
    camera.current = DENIED_FOREVER
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    await show()
    expect(screen.queryByRole('button', { name: 'Cho phép camera' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Mở Cài đặt' }))
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(camera.request).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('bị từ chối hẳn → bật quyền trong Cài đặt rồi quay lại app (AppState active) → đọc lại quyền, hiện camera', async () => {
    camera.current = DENIED_FOREVER
    camera.afterRequest = { ...DENIED_FOREVER, granted: true, status: 'granted' }
    let listener: ((state: string) => void) | undefined
    const remove = jest.fn()
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
      listener = cb as (state: string) => void
      return { remove }
    })
    const view = await show()
    expect(screen.queryByTestId('camera-view')).toBeNull()
    await act(async () => listener?.('background'))
    expect(camera.get).not.toHaveBeenCalled()
    await act(async () => listener?.('active'))
    expect(camera.get).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('camera-view')).toBeOnTheScreen()
    // Đã có quyền → không nghe thêm; unmount gỡ listener.
    expect(remove).toHaveBeenCalled()
    view.unmount()
  })

  it('đang đọc trạng thái quyền (null) → không camera, không nút quyền, ✕ vẫn có', async () => {
    camera.current = null
    await show()
    expect(screen.queryByTestId('camera-view')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cho phép camera' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeOnTheScreen()
  })
})

describe('ScanScreen — bố cục với thẻ đáy', () => {
  const layoutCard = async (height: number) =>
    fireEvent(screen.getByTestId('scan-screen-card'), 'layout', {
      nativeEvent: { layout: { x: 12, y: 0, width: 366, height } },
    })
  const frameBox = () => {
    const f = StyleSheet.flatten(
      screen.getByTestId('scan-frame', { includeHiddenElements: true }).props.style,
    )
    return { top: f.top as number, size: f.width as number }
  }

  it('khung + gợi ý nằm trên thẻ, dưới hàng nút', async () => {
    await show({ bottom: <Text>x</Text> })
    await layoutCard(300)
    const { top, size } = frameBox()
    const cardTop = H - 34 - 12 - 300
    expect(top + size).toBeLessThanOrEqual(cardTop - 40)
    expect(top).toBeGreaterThanOrEqual(47 + 8 + 44 + 16)
    expect(size).toBeGreaterThanOrEqual(180)
  })

  it('không có thẻ → khung giữa màn như cũ', async () => {
    await show()
    const { top, size } = frameBox()
    expect(top).toBe((H - size) / 2)
  })

  it('bottomExpanded: giữ vị trí khung, camera không đọc, vùng tối đậm hơn', async () => {
    let setExpanded: (v: boolean) => void = () => {}
    function Harness() {
      const [expanded, set] = useState(false)
      setExpanded = set
      return (
        <ScanScreen
          active
          hint="h"
          onScanned={onScanned}
          onClose={onClose}
          bottom={<Text>x</Text>}
          bottomExpanded={expanded}
        />
      )
    }
    await render(<Harness />, { wrapper })
    await layoutCard(300)
    const before = frameBox()
    await act(async () => setExpanded(true))
    await layoutCard(600)
    expect(frameBox()).toEqual(before)
    expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined()
    expect(screen.getByTestId('scan-dim-expanded', { includeHiddenElements: true })).toBeTruthy()
    await act(async () => setExpanded(false))
    expect(screen.queryByTestId('scan-dim-expanded', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeDefined()
  })
})
