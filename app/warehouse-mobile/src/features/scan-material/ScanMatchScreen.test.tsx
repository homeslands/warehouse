import { fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'

import { item } from '@/entities/inventory/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { SafeAreaWrapper } from '@/shared/ui/testing/safe-area'

import { ScanMatchScreen } from './ScanMatchScreen'

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }))

const camera = jest.requireMock('expo-camera').__permission as { reset: () => void }

const XM = item({ slug: 'i-xm', materialCode: 'VT-XM-040', materialSlug: 'xi-mang' })
const SON = item({ slug: 'i-son', materialCode: 'VT-SN-018', materialSlug: 'son' })

const onResult = jest.fn()
const onClose = jest.fn()

const onRetry = jest.fn()

/** `loading: true` → danh sách vật tư chưa tải xong (`items` undefined); `failed` → tải lỗi. */
async function show({ loading = false, failed = false, busy = false } = {}) {
  const items = loading || failed ? undefined : [XM, SON]
  await render(
    <ScanMatchScreen
      items={items}
      failed={failed}
      retrying={false}
      busy={busy}
      onRetry={onRetry}
      onResult={onResult}
      onClose={onClose}
    />,
    { wrapper: SafeAreaWrapper },
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

describe('ScanMatchScreen — khung', () => {
  it('✕ gọi onClose; có gợi ý quét', async () => {
    await show()
    expect(screen.getByText(/Đưa mã vạch hoặc mã QR của vật tư vào khung/)).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ScanMatchScreen — busy', () => {
  it('busy → thẻ đáy "Đang tra mã…"; không busy → không có; ✕ vẫn đóng khi busy', async () => {
    await show()
    expect(screen.queryByText('Đang tra mã…')).toBeNull()
    await show({ busy: true })
    expect(screen.getByText('Đang tra mã…')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('đã quét xong (done) → ✕ vẫn gọi onClose (khoá một lần nằm ở màn bọc)', async () => {
    await show()
    await scan('VT-XM-040')
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ScanMatchScreen — quét', () => {
  it('chỉ đọc các loại mã đã chốt (ean13, ean8, code128, qr — không Code39)', async () => {
    await show()
    expect(screen.getByTestId('camera-view').props.barcodeScannerSettings).toEqual({
      barcodeTypes: ['ean13', 'ean8', 'code128', 'qr'],
    })
  })

  it('mã khớp → onResult(found) + rung success', async () => {
    await show()
    await scan(' vt-xm-040 ')
    expect(onResult).toHaveBeenCalledWith({ kind: 'found', item: XM })
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success')
  })

  it('mã không khớp → onResult(none, mã) + rung lỗi', async () => {
    await show()
    await scan('8934563')
    expect(onResult).toHaveBeenCalledWith({ kind: 'none', text: '8934563' })
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error')
  })

  it('hai sự kiện quét liên tiếp → chỉ xử lý mã đầu', async () => {
    await show()
    await scan('VT-XM-040')
    await scan('VT-SN-018')
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith({ kind: 'found', item: XM })
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1)
  })

  it('danh sách vật tư chưa tải xong → chưa quét (không gắn onBarcodeScanned) + câu đang tải', async () => {
    await show({ loading: true })
    expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined()
    expect(screen.getByText('Đang tải danh sách vật tư…')).toBeOnTheScreen()
  })

  it('tải danh sách vật tư lỗi → báo lỗi + Thử lại (không kẹt ở "đang tải", không bật camera)', async () => {
    await show({ failed: true })
    expect(screen.queryByText('Đang tải danh sách vật tư…')).toBeNull()
    expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined()
    expect(screen.getByText('Không tải được tồn kho')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
