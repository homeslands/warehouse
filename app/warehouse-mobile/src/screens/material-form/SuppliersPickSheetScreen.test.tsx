// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native'

import { useAuthStore, type CurrentUser } from '@/entities/session'
import { useMaterialDraft } from '@/features/material-form'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { pressSheetCancel, pressSheetDone } from '@/shared/ui/testing/sheet-header'

import { SuppliersPickSheetScreen } from './SuppliersPickSheetScreen'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePreventRemove: () => jest.fn(),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

const user = (...scope: string[]): CurrentUser => ({ userName: 'u', roleName: 'STAFF', scope })
const PERMS = ['SUPPLIER_READ', 'SUPPLIER_UPDATE', 'MATERIAL_UPDATE']
const S1 = { slug: 's1', code: 'S1', name: 'Hoà Phát' }
const S2 = { slug: 's2', code: 'S2', name: 'Việt Nhật' }
const page = (items: object[]) =>
  ok({
    items,
    total: items.length,
    page: 1,
    pageSize: 100,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  })

let client: QueryClient
async function show() {
  await render(
    <QueryClientProvider client={client}>
      <SuppliersPickSheetScreen />
    </QueryClientProvider>,
  )
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
}
const rowOf = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) })
const ticked = (name: string) => rowOf(name).props.accessibilityState.checked

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  useMaterialDraft.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  route('get', '/suppliers', () => page([S1, S2]))
})
afterEach(async () => {
  await cleanup()
  client.clear()
  useAuthStore.setState({ user: null } as never)
})

describe('SuppliersPickSheetScreen', () => {
  it('hiện bên bán từ GET /suppliers; ô tìm ghim ngoài vùng cuộn', async () => {
    useAuthStore.setState({ user: user(...PERMS) } as never)
    await show()
    expect(screen.getByText('Hoà Phát')).toBeOnTheScreen()
    expect(screen.getByText('Việt Nhật')).toBeOnTheScreen()
    const scroll = screen.getByTestId('material-suppliers-sheet-scroll')
    expect(within(scroll).queryByLabelText('Tìm bên bán')).toBeNull()
    expect(screen.getByLabelText('Tìm bên bán')).toBeOnTheScreen()
  })

  it('nạp tick từ store; tick thêm; Xong ghi store rồi back', async () => {
    useAuthStore.setState({ user: user(...PERMS) } as never)
    useMaterialDraft.getState().setSuppliers(['s1'])
    await show()
    expect(ticked('Hoà Phát')).toBe(true)
    await fireEvent.press(rowOf('Việt Nhật'))
    expect(ticked('Việt Nhật')).toBe(true)
    await pressSheetDone()
    expect(useMaterialDraft.getState().suppliers).toEqual(['s1', 's2'])
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('bỏ hết tick rồi Xong → store []', async () => {
    useAuthStore.setState({ user: user(...PERMS) } as never)
    useMaterialDraft.getState().setSuppliers(['s1'])
    await show()
    await fireEvent.press(rowOf('Hoà Phát'))
    await pressSheetDone()
    expect(useMaterialDraft.getState().suppliers).toEqual([])
  })

  it('Huỷ (✕) → back, không ghi store', async () => {
    useAuthStore.setState({ user: user(...PERMS) } as never)
    useMaterialDraft.getState().setSuppliers(['s1'])
    await show()
    await fireEvent.press(rowOf('Việt Nhật'))
    await pressSheetCancel()
    expect(useMaterialDraft.getState().suppliers).toEqual(['s1'])
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('thiếu quyền → back, không request', async () => {
    useAuthStore.setState({ user: user('SUPPLIER_READ', 'MATERIAL_UPDATE') } as never)
    await show()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })
})
