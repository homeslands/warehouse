// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { Alert } from 'react-native'

import { useAuthStore, type UserWarehouse } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { SHEET_CLOSE_DELAY_MS as CLOSE_AFTER_SUCCESS_MS } from '@/shared/lib/useSheetSubmit'

import {
  pressSheetCancel,
  pressSheetDone,
  resetSheetHeader,
  sheetHeader,
} from '@/shared/ui/testing/sheet-header'

import { SelectWarehouseScreen } from './SelectWarehouseScreen'

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

// Test "đang ghi" thay `select` trong store bằng bản giả: lấy lại bản thật sau mỗi test.
const realSelect = useWarehouseStore.getState().select

const WH1: UserWarehouse = { slug: 'wh-1', code: 'WH1', name: 'Kho Tổng', isManager: true }
const WH2: UserWarehouse = { slug: 'wh-2', code: 'WH2', name: 'Kho Thủ Đức', isManager: false }

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  resetSheetHeader()
  useWarehouseStore.getState().reset()
  useAuthStore.setState({
    status: 'authenticated',
    user: { userName: 'root', roleName: 'MANAGER', scope: [], warehouses: [WH1, WH2] },
    endReason: null,
  })
})

afterEach(() => {
  jest.restoreAllMocks()
  useWarehouseStore.setState({ select: realSelect })
})

async function resolvedWith(current: UserWarehouse | null) {
  await useWarehouseStore.getState().resolveFor(useAuthStore.getState().user!)
  if (current) await useWarehouseStore.getState().select(current)
}

const row = (name: RegExp) => screen.getByRole('button', { name })

describe('SelectWarehouseScreen sheet (đổi kho, hai bước)', () => {
  it('header native: tiêu đề "Chọn kho", ✕ (Huỷ, xmark), ✓ (Xong, checkmark nổi bật)', async () => {
    await resolvedWith(WH1)
    await render(<SelectWarehouseScreen mode="sheet" />)
    const header = sheetHeader()
    expect(header.title).toBe('Chọn kho')
    expect(header.cancel).toMatchObject({ label: 'Huỷ', icon: { type: 'sfSymbol', name: 'xmark' } })
    expect(header.done).toMatchObject({
      label: 'Xong',
      icon: { type: 'sfSymbol', name: 'checkmark' },
      variant: 'prominent',
    })
    // Danh sách dạng thẻ (iOS 26/27): tiêu đề viết thường, mỗi kho một thẻ có vòng chọn.
    expect(screen.getByRole('header', { name: 'Kho của bạn · 2' })).toBeOnTheScreen()
    expect(screen.getByTestId('warehouse-card-wh-1')).toBeOnTheScreen()
  })

  it('chạm dòng chỉ đánh dấu (dấu tích chuyển sang), chưa đổi kho; ✓ mới ghi rồi đóng', async () => {
    await resolvedWith(WH1)
    await render(<SelectWarehouseScreen mode="sheet" />)
    await fireEvent.press(row(/^Kho Thủ Đức/))
    expect(row(/^Kho Thủ Đức/)).toBeSelected()
    expect(row(/^Kho Tổng/)).not.toBeSelected()
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-1')
    expect(mockRouter.back).not.toHaveBeenCalled()

    await pressSheetDone()
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1))
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-2')
  })

  it('rung "selection" khi đổi kho đánh dấu, không rung khi chạm lại kho đang đánh dấu', async () => {
    await resolvedWith(WH1)
    await render(<SelectWarehouseScreen mode="sheet" />)
    await fireEvent.press(row(/^Kho Tổng/))
    expect(Haptics.selectionAsync).not.toHaveBeenCalled()
    await fireEvent.press(row(/^Kho Thủ Đức/))
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
    await fireEvent.press(row(/^Kho Thủ Đức/))
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
    await fireEvent.press(row(/^Kho Tổng/))
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2)
  })

  it('ghi xong → rung "success", nút ✓ hiện xong, đóng bảng sau ~350ms (không sớm hơn)', async () => {
    await resolvedWith(WH1)
    jest.useFakeTimers()
    try {
      await render(<SelectWarehouseScreen mode="sheet" />)
      await fireEvent.press(row(/^Kho Thủ Đức/))
      await pressSheetDone()
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      )
      expect(useWarehouseStore.getState().current?.slug).toBe('wh-2')
      // Đang chờ đóng: ✕ khoá, ✓ không bấm lại được, chưa đóng.
      expect(sheetHeader().cancel?.disabled).toBe(true)
      await pressSheetDone()
      expect(useWarehouseStore.getState().current?.slug).toBe('wh-2')
      await act(async () => jest.advanceTimersByTime(CLOSE_AFTER_SUCCESS_MS - 50))
      expect(mockRouter.back).not.toHaveBeenCalled()
      await act(async () => jest.advanceTimersByTime(50))
      expect(mockRouter.back).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('✕ → đóng, kho giữ nguyên', async () => {
    await resolvedWith(WH1)
    await render(<SelectWarehouseScreen mode="sheet" />)
    await fireEvent.press(row(/^Kho Thủ Đức/))
    await pressSheetCancel()
    expect(mockRouter.back).toHaveBeenCalledTimes(1)
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-1')
  })

  it('✓ khi đánh dấu đúng kho đang chọn → chỉ đóng, không ghi', async () => {
    await resolvedWith(WH1)
    const select = jest.spyOn(useWarehouseStore.getState(), 'select')
    await render(<SelectWarehouseScreen mode="sheet" />)
    await pressSheetDone()
    expect(mockRouter.back).toHaveBeenCalledTimes(1)
    expect(select).not.toHaveBeenCalled()
  })

  it('đang ghi → ✓ báo bận, bấm thêm bị bỏ qua', async () => {
    await resolvedWith(WH1)
    let release!: () => void
    const select = jest.fn((_w: UserWarehouse) => new Promise<void>((r) => (release = r)))
    useWarehouseStore.setState({ select })
    await render(<SelectWarehouseScreen mode="sheet" />)
    await fireEvent.press(row(/^Kho Thủ Đức/))
    await pressSheetDone()
    // Đang ghi: ✓ thành vòng quay (mục custom), ✕ khoá.
    expect(sheetHeader().busy).toBe(true)
    expect(sheetHeader().done).toBeUndefined()
    expect(sheetHeader().cancel?.disabled).toBe(true)
    expect(select).toHaveBeenCalledTimes(1)
    await act(async () => release())
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1))
  })

  it('bảng bị đóng (unmount) trong lúc đang ghi → ghi xong không hẹn giờ đóng, không back()', async () => {
    await resolvedWith(WH1)
    let release!: () => void
    const select = jest.fn((_w: UserWarehouse) => new Promise<void>((r) => (release = r)))
    useWarehouseStore.setState({ select })
    jest.useFakeTimers()
    try {
      const view = await render(<SelectWarehouseScreen mode="sheet" />)
      await fireEvent.press(row(/^Kho Thủ Đức/))
      await pressSheetDone()
      expect(select).toHaveBeenCalledTimes(1)
      await view.unmount()
      await act(async () => release())
      await act(async () => jest.advanceTimersByTime(1000))
      expect(mockRouter.back).not.toHaveBeenCalled()
      expect(Haptics.notificationAsync).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('ghi lỗi → hộp thoại báo lỗi, bảng vẫn mở, thử lại được', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    // Chưa resolveFor → select() reject.
    useWarehouseStore.setState({ current: WH1, resolved: true, resolution: 'selected' })
    await render(<SelectWarehouseScreen mode="sheet" />)
    await fireEvent.press(row(/^Kho Thủ Đức/))
    await pressSheetDone()
    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1))
    expect(alert.mock.calls[0]![0]).toBe('Không đổi được kho')
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error)
    expect(mockRouter.back).not.toHaveBeenCalled()
    expect(sheetHeader().busy).toBe(false)
    expect(sheetHeader().cancel?.disabled).toBe(false)
  })
})

describe('SelectWarehouseScreen screen (lần đầu)', () => {
  it('tiêu đề lớn, không có ✕/✓; chạm là chọn rồi thay bằng /', async () => {
    await resolvedWith(null)
    await render(<SelectWarehouseScreen mode="screen" />)
    expect(screen.getByRole('header', { name: 'Chọn kho' })).toBeOnTheScreen()
    expect(sheetHeader().cancel).toBeUndefined()
    expect(sheetHeader().done).toBeUndefined()
    // Màn lần đầu giữ danh sách nhóm kiểu Cài đặt.
    expect(screen.getByRole('header', { name: '2 kho của bạn' })).toBeOnTheScreen()
    expect(screen.queryByTestId('warehouse-card-wh-1')).toBeNull()

    await fireEvent.press(row(/^Kho Thủ Đức/))
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'))
    expect(useWarehouseStore.getState().current?.slug).toBe('wh-2')
  })
})

describe('SelectWarehouseScreen screen — ADMIN tải danh sách kho lỗi', () => {
  const admin = { userSlug: 'ad', userName: 'admin', roleName: 'ADMIN', scope: [], warehouses: [] }

  beforeEach(() => {
    useAuthStore.setState({ status: 'authenticated', user: admin, endReason: null })
  })

  it('lỗi → báo lỗi + Thử lại (gọi lại GET /warehouses) + Đăng xuất; thử lại được thì hiện danh sách', async () => {
    route('get', '/warehouses', () => 'network')
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    await render(<SelectWarehouseScreen mode="screen" />)
    expect(screen.getByText('Không tải được danh sách kho')).toBeOnTheScreen()
    expect(screen.getByText('Không kết nối được máy chủ')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeOnTheScreen()
    expect(screen.queryByText(/kho của bạn/)).toBeNull()

    route('get', '/warehouses', () =>
      ok({
        items: [
          { slug: 'wh-1', code: 'WH1', name: 'Kho Tổng', isActive: true },
          { slug: 'wh-2', code: 'WH2', name: 'Kho Cũ', isActive: false },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        hasNext: false,
      }),
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() =>
      expect(screen.getByRole('header', { name: '2 kho của bạn' })).toBeOnTheScreen(),
    )
    expect(callsTo('get', '/warehouses')).toHaveLength(2)
    expect(screen.queryByText('Không tải được danh sách kho')).toBeNull()
    expect(screen.getByText('Đã tắt')).toBeOnTheScreen()
  })

  it('thử lại vẫn lỗi → vẫn ở màn lỗi, câu lỗi mới', async () => {
    route('get', '/warehouses', () => 'network')
    await useWarehouseStore.getState().resolveFor(admin, 'all')
    await render(<SelectWarehouseScreen mode="screen" />)
    route('get', '/warehouses', () => failure(403, 100523))
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(callsTo('get', '/warehouses')).toHaveLength(2))
    await waitFor(() => expect(screen.getByText('Không tải được danh sách kho')).toBeOnTheScreen())
    expect(screen.getByText('Bạn không quản lý hay thuộc kho này')).toBeOnTheScreen()
    expect(screen.queryByText('Không kết nối được máy chủ')).toBeNull()
  })
})
