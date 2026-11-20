import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'

import {
  LAUNCH_DURATION_MS,
  LAUNCH_FALLBACK_MS,
  LAUNCH_SKIP_MS,
  LaunchOverlay,
  holePath,
} from './LaunchOverlay'

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

const hidden = { includeHiddenElements: true }
const overlay = () => screen.getByTestId('launch-overlay', hidden)
const letters = () => screen.getAllByTestId(/^launch-letter-img-/, hidden)

async function loadAll() {
  for (const img of letters()) await fireEvent(img, 'load')
}

describe('holePath', () => {
  it('lỗ chưa mở (hệ số 0) → chỉ một hình chữ nhật phủ màn, nền đặc', () => {
    expect(holePath(400, 800, 100, 200, 8, 11, 0)).toBe('M0 0H400V800H0Z')
  })

  it('lỗ mở → thêm elip (hai cung) quanh tâm lỗ, bán kính nhân theo hệ số', () => {
    expect(holePath(400, 800, 100, 200, 8, 11, 2)).toBe(
      'M0 0H400V800H0Z M84 200a16 22 0 1 0 32 0a16 22 0 1 0 -32 0Z',
    )
  })
})

describe('LaunchOverlay', () => {
  it('khung đầu trùng splash gốc: 4 chữ cắt từ cùng ảnh logo 200pt; ẩn khỏi trình đọc màn hình', async () => {
    await render(<LaunchOverlay onShown={jest.fn()} onDone={jest.fn()} />)
    expect(overlay()).toHaveProp('importantForAccessibility', 'no-hide-descendants')
    expect(overlay()).toHaveProp('accessibilityElementsHidden', true)
    expect(letters()).toHaveLength(4)
    for (const img of letters()) {
      expect(img).toHaveStyle({ width: 200, height: 200 })
      // Android: tắt hiệu ứng mờ mặc định của Image, khung đầu phải trùng splash.
      expect(img).toHaveProp('fadeDuration', 0)
    }
  })

  it('đủ 4 chữ nạp xong mới báo onShown (gỡ splash gốc), MỘT lần', async () => {
    const onShown = jest.fn()
    await render(<LaunchOverlay onShown={onShown} onDone={jest.fn()} />)
    const [a, b, c, d] = letters()
    await fireEvent(a, 'load')
    await fireEvent(b, 'load')
    await fireEvent(c, 'load')
    expect(onShown).not.toHaveBeenCalled()
    await fireEvent(d, 'load')
    expect(onShown).toHaveBeenCalledTimes(1)
    await act(async () => jest.advanceTimersByTime(LAUNCH_FALLBACK_MS))
    expect(onShown).toHaveBeenCalledTimes(1)
  })

  it('laser quét qua: rung nhẹ 4 nhịp (mỗi chữ một), lỗ "o" mở ra, xong thì onDone', async () => {
    const onDone = jest.fn()
    await render(<LaunchOverlay onShown={jest.fn()} onDone={onDone} />)
    await loadAll()
    await act(async () => jest.advanceTimersByTime(LAUNCH_DURATION_MS - 1))
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(4)
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => jest.advanceTimersByTime(1))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('chạm để bỏ qua: mờ nhanh rồi onDone, không chạy tiếp các nhịp còn lại', async () => {
    const onDone = jest.fn()
    await render(<LaunchOverlay onShown={jest.fn()} onDone={onDone} />)
    await loadAll()
    await fireEvent(overlay(), 'touchStart')
    await act(async () => jest.advanceTimersByTime(LAUNCH_SKIP_MS))
    expect(onDone).toHaveBeenCalledTimes(1)
    await act(async () => jest.advanceTimersByTime(LAUNCH_DURATION_MS))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(jest.mocked(Haptics.selectionAsync).mock.calls.length).toBeLessThan(4)
  })

  it('logo không bao giờ nạp → vẫn gỡ splash sau thời gian dự phòng, không kẹt', async () => {
    const onShown = jest.fn()
    const onDone = jest.fn()
    await render(<LaunchOverlay onShown={onShown} onDone={onDone} />)
    await act(async () => jest.advanceTimersByTime(LAUNCH_FALLBACK_MS))
    expect(onShown).toHaveBeenCalledTimes(1)
    await act(async () => jest.advanceTimersByTime(LAUNCH_DURATION_MS))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('lỗi ảnh → gỡ splash ngay', async () => {
    const onShown = jest.fn()
    await render(<LaunchOverlay onShown={onShown} onDone={jest.fn()} />)
    await fireEvent(letters()[2], 'error')
    expect(onShown).toHaveBeenCalledTimes(1)
  })
})
