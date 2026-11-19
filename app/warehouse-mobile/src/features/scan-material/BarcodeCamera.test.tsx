import { fireEvent, render, screen } from '@testing-library/react-native'

import { changeLanguage, initI18n } from '@/shared/i18n'

import { BarcodeCamera } from './BarcodeCamera'
import { DEFAULT_SCAN_TIMING, scanTiming } from './scan-timing'

let now = 1_000_000
const onScanned = jest.fn()
const scan = (data: string) =>
  fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data, type: 'code128' })

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  jest.requireMock('expo-camera').__permission.reset()
  jest.clearAllMocks()
  now = 1_000_000
  jest.spyOn(performance, 'now').mockImplementation(() => now)
})

describe('BarcodeCamera', () => {
  it('camera thuần phủ kín cha, chỉ đọc các loại mã đã chốt; `torch` điều khiển enableTorch (mặc định tắt)', async () => {
    const view = await render(<BarcodeCamera active onScanned={onScanned} />)
    const cam = () => screen.getByTestId('camera-view')
    expect(cam().props.barcodeScannerSettings).toEqual({
      barcodeTypes: ['ean13', 'ean8', 'code128', 'qr'],
    })
    expect(cam().props.style).toMatchObject({ position: 'absolute', top: 0, left: 0 })
    expect(cam().props.enableTorch).toBe(false)
    await view.rerender(<BarcodeCamera active torch onScanned={onScanned} />)
    expect(cam().props.enableTorch).toBe(true)
  })

  it('không tự xin quyền: render camera ngay cả khi chưa có quyền (màn bọc ngoài lo quyền)', async () => {
    jest.requireMock('expo-camera').__permission.current = null
    await render(<BarcodeCamera active onScanned={onScanned} />)
    expect(screen.getByTestId('camera-view')).toBeOnTheScreen()
  })

  it('mặc định: chỉ báo MỘT lần', async () => {
    await render(<BarcodeCamera active onScanned={onScanned} />)
    await scan('A')
    now += 5000
    await scan('B')
    expect(onScanned).toHaveBeenCalledTimes(1)
  })

  it('continuous: bỏ cùng nội dung (trim) trong 2 s kể từ lần thấy gần nhất, cách tối thiểu 700 ms giữa hai lần nhận', async () => {
    await render(<BarcodeCamera continuous active onScanned={onScanned} />)
    await scan('A')
    now += 300
    await scan('B') // < 700 ms sau lần trước → bỏ
    now += 500
    await scan(' A ') // cùng nội dung trong 2 s → bỏ (mốc của A thành lần đọc này)
    now += 500
    await scan('B') // 1300 ms từ lần nhận đầu; B chưa từng nhận → nhận
    now += 1000
    await scan('A') // 1500 ms kể từ lần THẤY A gần nhất → bỏ (mốc làm mới)
    now += 2000
    await scan('A') // vắng đủ 2 s → nhận lại
    expect(onScanned.mock.calls.map(([d]) => d)).toEqual(['A', 'B', 'A'])
  })

  it('continuous: nhãn để yên trong khung không được cộng lại; chỉ nhận lại khi đã vắng ≥ 2 s', async () => {
    await render(<BarcodeCamera continuous active onScanned={onScanned} />)
    await scan('A')
    // Camera đọc A liên tục mỗi 500 ms trong 6 s → mỗi lần đọc làm mới mốc của A.
    for (let i = 0; i < 12; i++) {
      now += 500
      await scan('A')
    }
    expect(onScanned).toHaveBeenCalledTimes(1)
    // Đọc nội dung khác không mở lại A: A còn trong khung (đọc xen kẽ) vẫn bị bỏ.
    now += 500
    await scan('B')
    now += 500
    await scan('A')
    expect(onScanned.mock.calls.map(([d]) => d)).toEqual(['A', 'B'])
    // A vắng 1,9 s → vẫn bỏ (và làm mới mốc); vắng đủ 2 s → nhận lại.
    now += 1900
    await scan('A')
    now += 2000
    await scan('A')
    expect(onScanned.mock.calls.map(([d]) => d)).toEqual(['A', 'B', 'A'])
  })

  it('continuous: lần đọc bị bỏ vì quá sát lần nhận trước (700 ms) không chặn nội dung mới', async () => {
    await render(<BarcodeCamera continuous active onScanned={onScanned} />)
    await scan('A')
    now += 300
    await scan('B') // < 700 ms → bỏ, nhưng B chưa từng nhận nên không bị giữ mốc
    now += 500
    await scan('B')
    expect(onScanned.mock.calls.map(([d]) => d)).toEqual(['A', 'B'])
  })

  it('continuous: không có performance.now → dùng Date.now', async () => {
    const perf = globalThis.performance
    // @ts-expect-error — giả lập môi trường thiếu `performance`
    delete globalThis.performance
    try {
      jest.spyOn(Date, 'now').mockImplementation(() => now)
      await render(<BarcodeCamera continuous active onScanned={onScanned} />)
      await scan('A')
      now += 500
      await scan('A')
      now += 2500
      await scan('A')
      expect(onScanned).toHaveBeenCalledTimes(2)
    } finally {
      globalThis.performance = perf
    }
  })

  it('continuous: onRepeat báo đúng MỘT lần cho mỗi lần nhận; nhận lại thì báo lại được', async () => {
    const onRepeat = jest.fn()
    await render(<BarcodeCamera continuous active onScanned={onScanned} onRepeat={onRepeat} />)
    await scan('A')
    expect(onRepeat).not.toHaveBeenCalled()
    for (let i = 0; i < 5; i++) {
      now += 500
      await scan('A')
    }
    expect(onRepeat.mock.calls).toEqual([['A']])
    now += 2500
    await scan('A') // nhận lại
    expect(onScanned).toHaveBeenCalledTimes(2)
    now += 500
    await scan('A')
    now += 500
    await scan('A')
    expect(onRepeat).toHaveBeenCalledTimes(2)
  })

  it('continuous: bỏ vì quá sát 700 ms (nội dung khác) không gọi onRepeat', async () => {
    const onRepeat = jest.fn()
    await render(<BarcodeCamera continuous active onScanned={onScanned} onRepeat={onRepeat} />)
    await scan('A')
    now += 300
    await scan('B')
    expect(onRepeat).not.toHaveBeenCalled()
  })

  it('chế độ một lần: không gọi onRepeat', async () => {
    const onRepeat = jest.fn()
    await render(<BarcodeCamera active onScanned={onScanned} onRepeat={onRepeat} />)
    await scan('A')
    await scan('A')
    expect(onRepeat).not.toHaveBeenCalled()
  })

  it('region: bỏ mã có tâm ngoài khung ngắm (nhãn khác lọt ở mép hình), vẫn nhận mã trong khung', async () => {
    const region = { x: 65, y: 292, width: 260, height: 260 }
    await render(<BarcodeCamera continuous active region={region} onScanned={onScanned} />)
    const cam = screen.getByTestId('camera-view')
    await fireEvent(cam, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
    })
    const at = (data: string, x: number, y: number) =>
      fireEvent(cam, 'barcodeScanned', {
        data,
        type: 'code128',
        cornerPoints: [
          { x, y },
          { x: x + 40, y },
          { x: x + 40, y: y + 20 },
          { x, y: y + 20 },
        ],
      })
    await at('CU', 10, 100) // vật tư vừa quét còn ở mép trên trái → bỏ
    expect(onScanned).not.toHaveBeenCalled()
    now += 1000
    await at('MOI', 170, 410) // mã trong khung → nhận
    expect(onScanned).toHaveBeenCalledTimes(1)
    expect(onScanned).toHaveBeenLastCalledWith('MOI')
  })

  describe('giữ yên mới nhận (scanTiming thật: 350 ms, mất dấu 600 ms)', () => {
    beforeEach(() => Object.assign(scanTiming, DEFAULT_SCAN_TIMING))

    it('mã phải được thấy liên tục ≥ 350 ms mới nhận; trong lúc chờ báo khoá, nhận xong thì mở khoá', async () => {
      const onLockChange = jest.fn()
      await render(<BarcodeCamera active onScanned={onScanned} onLockChange={onLockChange} />)
      await scan('A')
      expect(onScanned).not.toHaveBeenCalled()
      expect(onLockChange).toHaveBeenLastCalledWith(true)
      now += 200
      await scan('A')
      expect(onScanned).not.toHaveBeenCalled()
      now += 200
      await scan('A') // 400 ms kể từ lần thấy đầu → nhận
      expect(onScanned).toHaveBeenCalledWith('A')
      expect(onLockChange).toHaveBeenLastCalledWith(false)
    })

    it('mã chỉ lướt qua (thấy một lần rồi vắng > 600 ms) → không nhận, lần sau đếm lại từ đầu', async () => {
      await render(<BarcodeCamera active onScanned={onScanned} />)
      await scan('A')
      now += 700 // vắng quá 600 ms
      await scan('A') // đếm lại từ đây
      now += 300
      await scan('A')
      expect(onScanned).not.toHaveBeenCalled()
      now += 100
      await scan('A') // 400 ms liên tục → nhận
      expect(onScanned).toHaveBeenCalledTimes(1)
    })

    it('báo lặp (onRepeat) KHÔNG ngay sau khi nhận — chỉ khi nhãn còn trong khung quá 1,5 s kể từ lúc nhận', async () => {
      const onRepeat = jest.fn()
      await render(<BarcodeCamera continuous active onScanned={onScanned} onRepeat={onRepeat} />)
      await scan('A')
      now += 400
      await scan('A') // đủ giữ yên → nhận
      expect(onScanned).toHaveBeenCalledTimes(1)
      // Nhãn để yên trong khung, camera đọc lại đều mỗi 300 ms.
      for (let i = 0; i < 4; i++) {
        now += 300
        await scan('A') // ≤ 1200 ms kể từ lúc nhận: bỏ qua, KHÔNG báo
      }
      expect(onRepeat).not.toHaveBeenCalled()
      now += 400
      await scan('A') // 1600 ms kể từ lúc nhận, vẫn trong khung → báo một lần
      now += 300
      await scan('A')
      expect(onRepeat).toHaveBeenCalledTimes(1)
      expect(onScanned).toHaveBeenCalledTimes(1)
    })

    it('mỗi mã đếm riêng: mã khác thoáng qua không làm mã đang giữ phải đếm lại', async () => {
      await render(<BarcodeCamera continuous active onScanned={onScanned} />)
      await scan('A')
      now += 150
      await scan('B') // B lướt qua
      now += 150
      await scan('A')
      now += 100
      await scan('A') // A: 400 ms liên tục → nhận; B chưa đủ
      expect(onScanned).toHaveBeenCalledTimes(1)
      expect(onScanned).toHaveBeenLastCalledWith('A')
    })
  })
})
