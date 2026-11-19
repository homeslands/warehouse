// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, calls, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native'

import { materialKeys } from '@/entities/material'
import { useMaterialDraft } from '@/features/material-form'
import { useAuthStore, type CurrentUser } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { confirmAction } from '@/shared/lib/native-confirm'
import { SHEET_CLOSE_DELAY_MS } from '@/shared/lib/useSheetSubmit'
import { pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { ConversionUnitSheetScreen } from './ConversionUnitSheetScreen'

const mockBack = jest.fn()
const mockPush = jest.fn()
const mockParams: { material?: string; unit?: string } = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  usePreventRemove: () => jest.fn(),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))
let mockEpoch = 0
jest.mock('@/entities/session', () => ({
  ...jest.requireActual('@/entities/session'),
  getSessionEpoch: () => mockEpoch,
}))
jest.mock('@/shared/lib/native-confirm', () => ({
  confirmAction: jest.fn(),
  chooseAction: jest.fn(),
}))
const confirm = confirmAction as jest.Mock

const user = (...scope: string[]): CurrentUser => ({ userName: 'u', roleName: 'STAFF', scope })
const KG = { slug: 'kg', code: 'KG', name: 'Kilogam' }
const THUNG = { slug: 'thung', code: 'THUNG', name: 'Thùng' }
const MATERIAL = {
  slug: 'm1',
  code: 'VT-01',
  name: 'Gạo',
  minimumInventory: 0,
  maximumInventory: 0,
  type: { slug: 'tp', code: 'TP', name: 'Thực phẩm' },
  baseUnit: KG,
  hasSupplier: false,
  suppliers: [],
  warehouses: [],
  units: [
    { unitSlug: 'kg', unitCode: 'KG', unitName: 'Kilogam', conversionRate: 1, isBaseUnit: true },
    {
      unitSlug: 'thung',
      unitCode: 'THUNG',
      unitName: 'Thùng',
      conversionRate: 10,
      isBaseUnit: false,
    },
  ],
  createdAt: '',
  updatedAt: '',
}
const PERMS = ['MATERIAL_READ', 'MATERIAL_UPDATE', 'UNIT_READ', 'UNIT_UPDATE']

let client: QueryClient
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
async function settled() {
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
}
async function show(unit?: string) {
  mockParams.material = 'm1'
  mockParams.unit = unit
  const view = await render(
    <QueryClientProvider client={client}>
      <ConversionUnitSheetScreen />
    </QueryClientProvider>,
  )
  await settled()
  return view
}
const signIn = (...perms: string[]) => useAuthStore.setState({ user: user(...perms) } as never)
const reply = (status: number, body: object) => ({
  status,
  data: { timestamp: '', path: '', method: 'X', ...body },
})

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockEpoch = 0
  mockParams.unit = undefined
  confirm.mockResolvedValue(true)
  useMaterialDraft.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  route('get', '/materials/m1', () => ok(MATERIAL))
})

afterEach(async () => {
  await cleanup()
  client.clear()
  useAuthStore.setState({ user: null } as never)
})

describe('ConversionUnitSheetScreen', () => {
  it('thêm: chọn THUNG qua store, rate 24 → hint → POST → đóng', async () => {
    signIn(...PERMS)
    route('post', '/materials/m1/conversion-units', () => ok(MATERIAL))
    await show()
    await act(async () => useMaterialDraft.getState().set('unit', THUNG))
    await fireEvent.changeText(screen.getByLabelText('Tỉ lệ'), '24')
    expect(screen.getByText(/1 THUNG = 24/)).toBeOnTheScreen()
    await pressSheetDone()
    const posts = callsTo('post', '/materials/m1/conversion-units')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0].body as string)).toEqual({ unitSlug: 'thung', conversionRate: 24 })
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('rate 0 → ✓ khoá', async () => {
    signIn(...PERMS)
    await show()
    await act(async () => useMaterialDraft.getState().set('unit', THUNG))
    await fireEvent.changeText(screen.getByLabelText('Tỉ lệ'), '0')
    expect(sheetHeader().done?.disabled).toBe(true)
  })

  it('sửa → PATCH conversion-units/thung { conversionRate: 12 }', async () => {
    signIn(...PERMS)
    route('patch', '/materials/m1/conversion-units/thung', () => ok(MATERIAL))
    await show('thung')
    expect(screen.getByLabelText('Tỉ lệ').props.value).toBe('10')
    await fireEvent.changeText(screen.getByLabelText('Tỉ lệ'), '12')
    await pressSheetDone()
    const patches = callsTo('patch', '/materials/m1/conversion-units/thung')
    expect(JSON.parse(patches[0].body as string)).toEqual({ conversionRate: 12 })
  })

  it('Gỡ → confirmAction destructive + câu cảnh báo → DELETE → invalidate → đóng', async () => {
    signIn(...PERMS)
    route('delete', '/materials/m1/conversion-units/thung', () => ok(null))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('thung')
    await fireEvent.press(screen.getByRole('button', { name: 'Gỡ đơn vị này' }))
    await settled()
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        destructive: true,
        message: expect.stringContaining('Phiếu và tồn kho đang ghi theo đơn vị này'),
      }),
    )
    expect(callsTo('delete', '/materials/m1/conversion-units/thung')).toHaveLength(1)
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: materialKeys.detail('m1') }),
    )
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('lỗi 100717 khi lưu → notFound, ✓ và nút Gỡ biến mất, sheet còn mở', async () => {
    signIn(...PERMS)
    route('patch', '/materials/m1/conversion-units/thung', () =>
      reply(404, { statusCode: 404, code: 100717, message: 'x' }),
    )
    await show('thung')
    await fireEvent.changeText(screen.getByLabelText('Tỉ lệ'), '12')
    await pressSheetDone()
    expect(screen.getByRole('alert')).toHaveTextContent(/không còn nữa/)
    expect(sheetHeader().done).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Gỡ đơn vị này' })).toBeNull()
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('đổi phiên giữa lúc DELETE đang chờ → không invalidate, không đóng, không alert', async () => {
    signIn(...PERMS)
    route('delete', '/materials/m1/conversion-units/thung', () => {
      mockEpoch++
      return ok(null)
    })
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('thung')
    await fireEvent.press(screen.getByRole('button', { name: 'Gỡ đơn vị này' }))
    await settled()
    expect(callsTo('delete', '/materials/m1/conversion-units/thung')).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('đổi phiên giữa lúc PATCH đang chờ → không invalidate, không đóng, không alert', async () => {
    signIn(...PERMS)
    route('patch', '/materials/m1/conversion-units/thung', () => {
      mockEpoch++
      return ok(MATERIAL)
    })
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('thung')
    await fireEvent.changeText(screen.getByLabelText('Tỉ lệ'), '12')
    await pressSheetDone()
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(callsTo('patch', '/materials/m1/conversion-units/thung')).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('thiếu UNIT_UPDATE → đóng, không request', async () => {
    signIn('MATERIAL_READ', 'MATERIAL_UPDATE', 'UNIT_READ')
    await show('thung')
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('thiếu param material → đóng, không request', async () => {
    signIn(...PERMS)
    mockParams.material = undefined
    await render(
      <QueryClientProvider client={client}>
        <ConversionUnitSheetScreen />
      </QueryClientProvider>,
    )
    await settled()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('đóng sheet (unmount) không xoá lựa chọn của sheet mở lại ngay sau đó', async () => {
    signIn(...PERMS)
    const view = await show()
    await act(async () => useMaterialDraft.getState().set('unit', THUNG))
    await view.unmount()
    expect(useMaterialDraft.getState().unit).toEqual(THUNG)
  })
})
