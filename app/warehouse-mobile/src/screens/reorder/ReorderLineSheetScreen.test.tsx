// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native'

import { item } from '@/entities/inventory/model/fixtures'
import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { reorderStorageKey, todayKey, useReorderStore } from '@/features/reorder'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'
import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ReorderLineSheetScreen } from './ReorderLineSheetScreen'

const mockBack = jest.fn()
/** `usePreventRemove` giả (như `ExportLineSheetScreen.test`): `swipeDown()` = vuốt xuống / back Android. */
const mockGuard: {
  prevent: boolean
  onBlocked: ((e: { repeat: () => void }) => void) | null
} = { prevent: false, onBlocked: null }
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ materialSlug: 'sua' }),
  usePreventRemove: (prevent: boolean, onBlocked: (e: { repeat: () => void }) => void) => {
    mockGuard.prevent = prevent
    mockGuard.onBlocked = onBlocked
    return jest.fn()
  },
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))
jest.mock('@/shared/lib/native-confirm', () => ({
  ...jest.requireActual('@/shared/lib/native-confirm'),
  chooseAction: jest.fn(),
  confirmAction: jest.fn(),
}))

const LIST = '/warehouses/wh-a/materials'
const AVAILABLE = '/warehouses/wh-a/import-forms/available-materials'
const WH = { slug: 'wh-a', code: 'A', name: 'Kho Tổng', isManager: true }
const ABC = { slug: 's-abc', code: 'ABC', name: 'Công ty ABC' }
const XYZ = { slug: 's-xyz', code: 'XYZ', name: 'Công ty XYZ' }
const SUA = item({
  slug: 'i-sua',
  materialSlug: 'sua',
  materialName: 'Sữa tươi',
  quantity: 4,
  effectiveMinimumInventory: 10,
  effectiveMaximumInventory: 30,
  baseUnit: { slug: 'u-chai', code: 'CHAI', name: 'chai' },
  units: [
    { unitSlug: 'u-chai', unitCode: 'CHAI', unitName: 'chai', conversionRate: 1, isBaseUnit: true },
    {
      unitSlug: 'u-thung',
      unitCode: 'THUNG',
      unitName: 'thùng',
      conversionRate: 24,
      isBaseUnit: false,
    },
  ],
})
const page = (items: object[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1, hasNext: false })

let client: QueryClient

async function settled() {
  await act(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    await tick()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await tick()
    await tick()
  })
}

/** Sheet tự nạp phần lưu trên máy (deep link) — test không gọi `load` hộ. */
async function show() {
  await render(
    <QueryClientProvider client={client}>
      <ReorderLineSheetScreen />
    </QueryClientProvider>,
  )
  await settled()
}

async function swipeDown() {
  await act(async () => {
    if (mockGuard.prevent) mockGuard.onBlocked!({ repeat: () => mockBack() })
    else mockBack()
  })
}
const DISCARD = 'Bỏ thay đổi?'

const seed = (value: number) =>
  AsyncStorage.setItem(
    reorderStorageKey('u1', 'wh-a'),
    JSON.stringify({ sua: { qty: { value, unitSlug: 'u-chai' } } }),
  )

const local = () => useReorderStore.getState().local.sua

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(async () => {
  jest.clearAllMocks()
  resetFakeApi()
  await AsyncStorage.clear()
  useReorderStore.setState({ scope: null, local: {}, loaded: false })
  mockGuard.prevent = false
  mockGuard.onBlocked = null
  jest.mocked(confirmAction).mockResolvedValue(true)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useWarehouseStore.setState({ current: WH, resolved: true, resolution: 'selected' })
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      userSlug: 'u1',
      userName: 'an',
      roleName: 'STAFF',
      scope: ['IMPORT_FORM_CREATE'],
      warehouses: [WH],
    } as never,
  })
  route('get', LIST, () => page([SUA]))
  route('get', AVAILABLE, () =>
    page([
      {
        slug: 'sua',
        code: 'sua',
        name: 'Sữa',
        baseUnitSlug: 'u-chai',
        quantity: 4,
        suppliers: [ABC, XYZ],
        units: [],
      },
    ]),
  )
})

afterEach(async () => {
  await cleanup()
  client.clear()
  jest.restoreAllMocks()
})

describe('ReorderLineSheetScreen', () => {
  it('tên vật tư làm tiêu đề, ô số điền sẵn số gợi ý', async () => {
    await show()
    expect(sheetHeader().title).toBe('Sữa tươi')
    expect(screen.getByLabelText('Số lượng đặt').props.value).toBe('26')
  })

  it('sửa số + đổi đơn vị → ✓ ghi store đúng rồi đóng', async () => {
    ;(chooseAction as jest.Mock).mockResolvedValue(1)
    await show()
    await fireEvent.changeText(screen.getByLabelText('Số lượng đặt'), '3')
    await fireEvent.press(screen.getByRole('button', { name: /Đơn vị/ }))
    await settled()
    await pressSheetDone()
    expect(local()?.qty).toEqual({ value: 3, unitSlug: 'u-thung' })
    expect(mockBack).toHaveBeenCalled()
  })

  it('số 0 → lỗi dưới ô, ✓ khoá', async () => {
    await show()
    await fireEvent.changeText(screen.getByLabelText('Số lượng đặt'), '0')
    expect(screen.getByText('Nhập số lớn hơn 0.')).toBeOnTheScreen()
    expect(sheetHeader().done?.disabled).toBe(true)
    await pressSheetDone()
    expect(local()).toBeUndefined()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('ô trống → setQty(null) (quay về gợi ý)', async () => {
    await act(async () => {})
    await show()
    await act(async () =>
      useReorderStore.getState().setQty('sua', { value: 5, unitSlug: 'u-chai' }),
    )
    await fireEvent.changeText(screen.getByLabelText('Số lượng đặt'), '')
    await pressSheetDone()
    expect(local()?.qty).toBeUndefined()
  })

  it('chọn bên bán → supplierSlug', async () => {
    await show()
    await fireEvent.press(screen.getByText('Công ty XYZ'))
    await pressSheetDone()
    expect(local()?.supplierSlug).toBe('s-xyz')
  })

  it('"Bỏ dấu đã đặt" xoá orderedAt', async () => {
    await show()
    await act(async () => useReorderStore.getState().markOrdered(['sua'], todayKey()))
    await fireEvent.press(screen.getByRole('button', { name: /Bỏ dấu/ }))
    expect(local()?.orderedAt).toBeUndefined()
  })

  it('✕ đóng không ghi', async () => {
    await show()
    await fireEvent.changeText(screen.getByLabelText('Số lượng đặt'), '9')
    await pressSheetCancel()
    expect(local()).toBeUndefined()
    expect(mockBack).toHaveBeenCalled()
  })

  it('đổi kho khi đang mở → đóng', async () => {
    await show()
    await act(async () => {
      useWarehouseStore.setState({ current: { ...WH, slug: 'wh-b' } })
    })
    expect(mockBack).toHaveBeenCalled()
  })

  it.each<['vi' | 'en', number, string]>([
    ['vi', 2.5, '2,5'],
    ['vi', 1234.5, '1234,5'],
    ['en', 2.5, '2.5'],
    ['en', 1234.5, '1234.5'],
  ])('%s: số đã lưu %s điền đúng vào ô và ✓ không đổi số đã lưu', async (lang, value, text) => {
    await changeLanguage(lang)
    try {
      await seed(value)
      await show()
      const label = lang === 'en' ? 'Quantity to order' : 'Số lượng đặt'
      expect(screen.getByLabelText(label).props.value).toBe(text)
      await pressSheetDone()
      expect(local()?.qty).toEqual({ value, unitSlug: 'u-chai' })
    } finally {
      await cleanup()
      await changeLanguage('vi')
    }
  })

  it('chưa nạp xong phần lưu trên máy → không có ✓', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise(() => {}))
    await show()
    expect(useReorderStore.getState().loaded).toBe(false)
    expect(sheetHeader().done).toBeUndefined()
  })
  it('mở thẳng khi store lệch khoá (deep link): spinner, tự nạp đúng người + kho, không dùng dữ liệu cũ', async () => {
    useReorderStore.setState({
      scope: 'u9|wh-z',
      loaded: true,
      local: { sua: { qty: { value: 99, unitSlug: 'u-chai' } } },
    })
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise(() => {}))
    await show()
    // Đang nạp khoá mới: chưa có ô số / ✓, tuyệt đối không hiện 99 của khoá cũ.
    expect(screen.queryByLabelText('Số lượng đặt')).toBeNull()
    expect(sheetHeader().done).toBeUndefined()
  })

  it('mở thẳng khi store chưa nạp: tự nạp rồi hiện số đã lưu của đúng khoá', async () => {
    await seed(7)
    useReorderStore.setState({ scope: 'u9|wh-z', loaded: true, local: {} })
    await show()
    expect(useReorderStore.getState().scope).toBe('u1|wh-a')
    expect(screen.getByLabelText('Số lượng đặt').props.value).toBe('7')
  })

  it('danh sách bên bán về sau: bên bán đã lưu được tick (không dựng thân khi chưa biết bên bán)', async () => {
    await AsyncStorage.setItem(
      reorderStorageKey('u1', 'wh-a'),
      JSON.stringify({ sua: { supplierSlug: 's-xyz' } }),
    )
    let release!: () => void
    route(
      'get',
      AVAILABLE,
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve(
              page([
                {
                  slug: 'sua',
                  code: 'sua',
                  name: 'Sữa',
                  baseUnitSlug: 'u-chai',
                  quantity: 4,
                  suppliers: [ABC, XYZ],
                  units: [],
                },
              ]),
            )
        }),
    )
    await show()
    expect(screen.queryByLabelText('Số lượng đặt')).toBeNull()
    expect(sheetHeader().done).toBeUndefined()
    await act(async () => release())
    await settled()
    expect(screen.getByRole('button', { name: /Công ty XYZ/ })).toHaveProp('accessibilityState', {
      selected: true,
    })
    expect(screen.getByRole('button', { name: /Công ty ABC/ })).toHaveProp('accessibilityState', {
      selected: false,
    })
  })

  it('available-materials bị cắt (truncated) → không có chọn bên bán', async () => {
    route('get', AVAILABLE, () =>
      ok({
        items: [
          {
            slug: 'sua',
            code: 'sua',
            name: 'Sữa',
            baseUnitSlug: 'u-chai',
            quantity: 4,
            suppliers: [ABC, XYZ],
            units: [],
          },
        ],
        total: 9999,
        page: 1,
        pageSize: 100,
        totalPages: 99,
        hasNext: true,
      }),
    )
    await show()
    expect(screen.getByLabelText('Số lượng đặt')).toBeOnTheScreen()
    expect(screen.queryByText('Công ty XYZ')).toBeNull()
  })

  describe('bỏ thay đổi (useDiscardGuard)', () => {
    it('chưa sửa: ✕ và vuốt xuống đóng thẳng, không hỏi', async () => {
      await show()
      expect(mockGuard.prevent).toBe(false)
      await pressSheetCancel()
      expect(mockBack).toHaveBeenCalledTimes(1)
      await swipeDown()
      expect(confirmAction).not.toHaveBeenCalled()
    })

    it('đã sửa số: ✕ hỏi; "Tiếp tục sửa" → ở lại, đồng ý → đóng và không ghi', async () => {
      await show()
      await fireEvent.changeText(screen.getByLabelText('Số lượng đặt'), '9')
      expect(mockGuard.prevent).toBe(true)
      jest.mocked(confirmAction).mockResolvedValueOnce(false)
      await pressSheetCancel()
      expect(confirmAction).toHaveBeenCalledWith(
        expect.objectContaining({ title: DISCARD, destructive: true }),
      )
      expect(mockBack).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Số lượng đặt').props.value).toBe('9')
      await pressSheetCancel()
      expect(mockBack).toHaveBeenCalledTimes(1)
      expect(local()).toBeUndefined()
    })

    it('đã sửa: vuốt xuống hỏi, đồng ý thì đi tiếp', async () => {
      await show()
      await fireEvent.changeText(screen.getByLabelText('Số lượng đặt'), '9')
      jest.mocked(confirmAction).mockResolvedValueOnce(false)
      await swipeDown()
      expect(mockBack).not.toHaveBeenCalled()
      await swipeDown()
      expect(mockBack).toHaveBeenCalledTimes(1)
    })

    it('đổi nơi đặt cũng tính là đã sửa; gõ rồi trả về số cũ thì hết sửa', async () => {
      await show()
      await fireEvent.press(screen.getByText('Công ty XYZ'))
      expect(mockGuard.prevent).toBe(true)
      await fireEvent.press(screen.getByText('Công ty ABC'))
      expect(mockGuard.prevent).toBe(true)
      const field = screen.getByLabelText('Số lượng đặt')
      await fireEvent.changeText(field, '5')
      await fireEvent.changeText(field, '26')
      await fireEvent.press(screen.getByText('Công ty XYZ'))
      expect(mockGuard.prevent).toBe(true)
    })

    it('✓ ghi xong đóng không hỏi', async () => {
      await show()
      await fireEvent.changeText(screen.getByLabelText('Số lượng đặt'), '9')
      await pressSheetDone()
      expect(mockBack).toHaveBeenCalled()
      expect(confirmAction).not.toHaveBeenCalled()
      expect(mockGuard.prevent).toBe(false)
    })
  })
})
