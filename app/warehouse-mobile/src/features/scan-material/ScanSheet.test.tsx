import { fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { Linking } from 'react-native'

import { item } from '@/entities/inventory/model/fixtures'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { pressSheetCancel, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ScanSheet } from './ScanSheet'

jest.mock('expo-router', () => ({
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

type Permission = { granted: boolean; canAskAgain: boolean; status: string; expires: string }
const camera = jest.requireMock('expo-camera').__permission as {
  current: Permission | null
  afterRequest: Permission
  request: jest.Mock
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

const XM = item({ slug: 'i-xm', materialCode: 'VT-XM-040', materialSlug: 'xi-mang' })
const SON = item({ slug: 'i-son', materialCode: 'VT-SN-018', materialSlug: 'son' })

const onResult = jest.fn()
const onClose = jest.fn()

const onRetry = jest.fn()

/** `loading: true` → danh sách vật tư chưa tải xong (`items` undefined); `failed` → tải lỗi. */
async function show({ loading = false, failed = false } = {}) {
  const items = loading || failed ? undefined : [XM, SON]
  await render(
    <ScanSheet
      items={items}
      failed={failed}
      retrying={false}
      onRetry={onRetry}
      onResult={onResult}
      onClose={onClose}
    />,
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

describe('ScanSheet — header', () => {
  it('tiêu đề "Quét mã vật tư", chỉ có ✕ (không có ✓); ✕ gọi onClose', async () => {
    await show()
    expect(sheetHeader().title).toBe('Quét mã vật tư')
    expect(sheetHeader().done).toBeUndefined()
    await pressSheetCancel()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ScanSheet — quyền camera', () => {
  it('chưa cấp quyền → câu giải thích + "Cho phép camera" gọi xin quyền; cấp xong → hiện camera', async () => {
    camera.current = DENIED_ASK
    await show()
    expect(screen.queryByTestId('camera-view')).toBeNull()
    expect(screen.getByText('Cần quyền dùng camera')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Cho phép camera' }))
    expect(camera.request).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('camera-view')).toBeOnTheScreen()
  })

  it('bị từ chối hẳn → "Mở Cài đặt" mở Cài đặt của máy, không xin quyền lại', async () => {
    camera.current = DENIED_FOREVER
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    await show()
    expect(screen.queryByRole('button', { name: 'Cho phép camera' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Mở Cài đặt' }))
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(camera.request).not.toHaveBeenCalled()
  })

  it('đang đọc trạng thái quyền (null) → không hiện camera cũng không hiện nút', async () => {
    camera.current = null
    await show()
    expect(screen.queryByTestId('camera-view')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cho phép camera' })).toBeNull()
  })
})

describe('ScanSheet — quét', () => {
  it('chỉ đọc các loại mã đã chốt (ean13, ean8, code128, code39, qr)', async () => {
    await show()
    expect(screen.getByTestId('camera-view').props.barcodeScannerSettings).toEqual({
      barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr'],
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
    expect(screen.queryByTestId('camera-view')).toBeNull()
    expect(screen.getByText('Không tải được tồn kho')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
