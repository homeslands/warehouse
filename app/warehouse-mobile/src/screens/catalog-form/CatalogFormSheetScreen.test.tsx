// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, calls, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native'

import { useAuthStore, type CurrentUser } from '@/entities/session'
import { unitKeys } from '@/entities/unit'
import type { CatalogKind } from '@/features/catalog-form'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { confirmAction } from '@/shared/lib/native-confirm'
import { SHEET_CLOSE_DELAY_MS } from '@/shared/lib/useSheetSubmit'
import { pressSheetCancel, pressSheetDone, sheetHeader } from '@/shared/ui/testing/sheet-header'

import { CatalogFormSheetScreen } from './CatalogFormSheetScreen'

const mockBack = jest.fn()
const mockParams: { slug?: string } = {}
const mockGuard: { prevent: boolean } = { prevent: false }
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  usePreventRemove: (prevent: boolean) => {
    mockGuard.prevent = prevent
    return jest.fn()
  },
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

const UNIT = {
  slug: 'kg',
  code: 'KG',
  name: 'Kilogam',
  description: null,
  createdAt: '',
  updatedAt: '',
}

let client: QueryClient

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
async function settled() {
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
}

async function show(kind: CatalogKind, slug?: string) {
  mockParams.slug = slug
  await render(
    <QueryClientProvider client={client}>
      <CatalogFormSheetScreen kind={kind} />
    </QueryClientProvider>,
  )
  await settled()
}

function signIn(...perms: string[]) {
  useAuthStore.setState({ user: user(...perms) } as never)
}

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
  mockParams.slug = undefined
  mockEpoch = 0
  confirm.mockResolvedValue(true)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  route('get', '/units/kg', () => ok(UNIT))
})

afterEach(async () => {
  await cleanup()
  client.clear()
  useAuthStore.setState({ user: null } as never)
})

describe('CatalogFormSheetScreen', () => {
  it('tạo đơn vị: gõ kg + Kilogam → ✓ → hỏi "KG · Kilogam" → POST /units → đóng', async () => {
    signIn('UNIT_READ', 'UNIT_CREATE')
    route('post', '/units', () => ok(UNIT))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('unit')
    expect(sheetHeader().title).toBe('Thêm đơn vị')
    await fireEvent.changeText(screen.getByLabelText('Mã'), 'kg')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Kilogam')
    await pressSheetDone()
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Tạo đơn vị?', message: 'KG · Kilogam' }),
    )
    const posts = callsTo('post', '/units')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0].body as string)).toEqual({ code: 'KG', name: 'Kilogam' })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: unitKeys.list() }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['inventory'] }))
    expect(mockBack).not.toHaveBeenCalled()
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('tạo khi thiếu UNIT_CREATE → sheet đóng, không request', async () => {
    signIn('UNIT_READ')
    await show('unit')
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('sửa: ✓ khoá khi chưa đổi; đổi tên → PATCH chỉ { name }', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE')
    route('patch', '/units/kg', () => ok(UNIT))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('unit', 'kg')
    expect(screen.getByLabelText('Mã').props.value).toBe('KG')
    expect(sheetHeader().done?.disabled).toBe(true)
    await pressSheetDone()
    expect(confirm).not.toHaveBeenCalled()
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Ki-lô-gam')
    expect(sheetHeader().done?.disabled).toBe(false)
    await pressSheetDone()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lưu thay đổi?' }))
    const patches = callsTo('patch', '/units/kg')
    expect(JSON.parse(patches[0].body as string)).toEqual({ name: 'Ki-lô-gam' })
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: unitKeys.list() }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: unitKeys.detail('kg') }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['inventory'] }))
  })

  it('lỗi 100906 → câu lỗi dưới ô Mã, sheet còn mở, dữ liệu giữ nguyên', async () => {
    signIn('UNIT_READ', 'UNIT_CREATE')
    route('post', '/units', () => reply(409, { statusCode: 409, code: 100906, message: 'x' }))
    await show('unit')
    await fireEvent.changeText(screen.getByLabelText('Mã'), 'kg')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Kilogam')
    await pressSheetDone()
    expect(screen.getByText(/Mã đơn vị đã tồn tại/i)).toBeOnTheScreen()
    expect(screen.getByLabelText('Mã').props.value).toBe('kg')
    expect(screen.getByLabelText('Tên').props.value).toBe('Kilogam')
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('lỗi 403 Forbidden resource → hộp lỗi đầu sheet (permissionDenied), không đóng', async () => {
    signIn('UNIT_READ', 'UNIT_CREATE')
    route('post', '/units', () => reply(403, { statusCode: 403, message: 'Forbidden resource' }))
    await show('unit')
    await fireEvent.changeText(screen.getByLabelText('Mã'), 'kg')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Kilogam')
    await pressSheetDone()
    expect(screen.getByRole('alert')).toHaveTextContent(/không có quyền thực hiện thao tác này/)
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(mockBack).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Tên').props.value).toBe('Kilogam')
  })

  it('lỗi 404 100901 khi lưu → câu notFound, ✓ biến mất, list key bị invalidate, không tự đóng', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE', 'UNIT_DELETE')
    route('patch', '/units/kg', () => reply(404, { statusCode: 404, code: 100901, message: 'x' }))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('unit', 'kg')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Khác')
    await pressSheetDone()
    expect(screen.getByRole('alert')).toHaveTextContent(/không còn nữa/)
    expect(sheetHeader().done).toBeUndefined()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: unitKeys.list() }))
    expect(mockGuard.prevent).toBe(false)
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('cache list có mô tả cũ, detail trả mô tả mới: ✓ vẫn khoá, ✕ không hỏi, đổi tên → PATCH chỉ { name }', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE')
    client.setQueryData(unitKeys.list(), [{ ...UNIT, description: 'cũ' }])
    route('get', '/units/kg', () => ok({ ...UNIT, description: 'mới' }))
    route('patch', '/units/kg', () => ok(UNIT))
    await show('unit', 'kg')
    await act(async () => {
      await client.refetchQueries({ queryKey: unitKeys.detail('kg') })
    })
    await settled()
    expect(callsTo('get', '/units/kg').length).toBeGreaterThanOrEqual(1)
    expect(sheetHeader().done?.disabled).toBe(true)
    expect(mockGuard.prevent).toBe(false)
    await pressSheetCancel()
    expect(confirm).not.toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalledTimes(1)
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Khác')
    await pressSheetDone()
    const patches = callsTo('patch', '/units/kg')
    expect(JSON.parse(patches[0].body as string)).toEqual({ name: 'Khác' })
  })

  it('sửa xong bấm ✕ → hỏi "Bỏ thay đổi?"; không đồng ý thì ở lại', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE')
    await show('unit', 'kg')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Khác')
    expect(mockGuard.prevent).toBe(true)
    confirm.mockResolvedValueOnce(false)
    await pressSheetCancel()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bỏ thay đổi?' }))
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('phiên đổi giữa lúc ghi ✓ → bỏ kết quả: không invalidate', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE')
    route('patch', '/units/kg', () => {
      mockEpoch++
      return ok(UNIT)
    })
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('unit', 'kg')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Khác')
    await pressSheetDone()
    await wait(SHEET_CLOSE_DELAY_MS + 50)
    expect(callsTo('patch', '/units/kg')).toHaveLength(1)
    expect(spy).not.toHaveBeenCalled()
  })

  it('bấm ✓ hai lần liền → chỉ 1 hộp xác nhận và 1 request', async () => {
    signIn('UNIT_READ', 'UNIT_CREATE')
    route('post', '/units', () => ok(UNIT))
    await show('unit')
    await fireEvent.changeText(screen.getByLabelText('Mã'), 'kg')
    await fireEvent.changeText(screen.getByLabelText('Tên'), 'Kilogam')
    await act(async () => {
      const done = sheetHeader().done
      done?.onPress()
      done?.onPress()
    })
    await settled()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(callsTo('post', '/units')).toHaveLength(1)
  })

  it('tải bản ghi 404 (100901) → câu notFound, không ✓/Xoá, invalidate list', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE', 'UNIT_DELETE')
    route('get', '/units/kg', () => reply(404, { statusCode: 404, code: 100901, message: 'x' }))
    const spy = jest.spyOn(client, 'invalidateQueries')
    await show('unit', 'kg')
    expect(screen.getByRole('alert')).toHaveTextContent(/không còn nữa/)
    expect(sheetHeader().done).toBeUndefined()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: unitKeys.list() }))
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('mở sửa (có slug) mà thiếu UNIT_UPDATE → sheet đóng, không request ghi', async () => {
    signIn('UNIT_READ', 'UNIT_DELETE')
    await show('unit', 'kg')
    expect(mockBack).toHaveBeenCalled()
    expect(calls.filter((c) => c.method !== 'get')).toHaveLength(0)
    expect(screen.queryByLabelText('Mã')).toBeNull()
  })

  it('sheet không có nút Xoá cũng không có khối "Đang dùng" (đã chuyển sang màn chi tiết)', async () => {
    signIn('UNIT_READ', 'UNIT_UPDATE', 'UNIT_DELETE')
    client.setQueryData(unitKeys.list(), [
      { ...UNIT, materialCount: { asBaseUnit: 2, asConversionUnit: 2, total: 2 } },
    ])
    await show('unit', 'kg')
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull()
    expect(screen.queryByTestId('unit-usage')).toBeNull()
  })
})
