// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, resetFakeApi } from '@/shared/api/testing/fake-api'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native'

import { useWarehouseStore } from '@/entities/warehouse'
import { useMaterialDraft } from '@/features/material-form'
import { useAuthStore, type CurrentUser } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { pressSheetCancel, pressSheetDone } from '@/shared/ui/testing/sheet-header'

import { WarehousesPickSheetScreen } from './WarehousesPickSheetScreen'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePreventRemove: () => jest.fn(),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

const user = (warehouses: object[], ...scope: string[]): CurrentUser => ({
  userName: 'u',
  roleName: 'STAFF',
  scope,
  warehouses: warehouses as never,
})
const W1 = { slug: 'w1', code: 'W1', name: 'Kho Một', isManager: true }
const W2 = { slug: 'w2', code: 'W2', name: 'Kho Hai', isManager: true }
const W3 = { slug: 'w3', code: 'W3', name: 'Kho Ba', isManager: true, isActive: false }
const PERMS = ['MATERIAL_UPDATE', 'WAREHOUSE_UPDATE']

async function show() {
  await render(<WarehousesPickSheetScreen />)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
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
  useWarehouseStore.setState({ warehouses: null } as never)
})
afterEach(async () => {
  await cleanup()
  useAuthStore.setState({ user: null } as never)
})

describe('WarehousesPickSheetScreen', () => {
  it('hiện kho từ user.warehouses; kho tắt "Đã tắt" khoá, không tick được; ô tìm ghim', async () => {
    useAuthStore.setState({ user: user([W1, W2, W3], ...PERMS) } as never)
    await show()
    expect(screen.getByText('Kho Một')).toBeOnTheScreen()
    expect(screen.getByText('Đã tắt')).toBeOnTheScreen()
    await fireEvent.press(rowOf('Kho Ba'))
    expect(ticked('Kho Ba')).toBe(false)
    const scroll = screen.getByTestId('material-warehouses-sheet-scroll')
    expect(within(scroll).queryByLabelText('Tìm kho')).toBeNull()
    expect(screen.getByLabelText('Tìm kho')).toBeOnTheScreen()
  })

  it('nạp tick từ store; tick nhiều; Xong ghi store rồi back', async () => {
    useAuthStore.setState({ user: user([W1, W2], ...PERMS) } as never)
    useMaterialDraft.getState().setWarehouses(['w1'])
    await show()
    expect(ticked('Kho Một')).toBe(true)
    await fireEvent.press(rowOf('Kho Hai'))
    expect(ticked('Kho Hai')).toBe(true)
    await pressSheetDone()
    expect(useMaterialDraft.getState().warehouses).toEqual(['w1', 'w2'])
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('bỏ hết tick rồi Xong → store []', async () => {
    useAuthStore.setState({ user: user([W1, W2], ...PERMS) } as never)
    useMaterialDraft.getState().setWarehouses(['w1'])
    await show()
    await fireEvent.press(rowOf('Kho Một'))
    await pressSheetDone()
    expect(useMaterialDraft.getState().warehouses).toEqual([])
  })

  it('Huỷ (✕) → back, không ghi store', async () => {
    useAuthStore.setState({ user: user([W1, W2], ...PERMS) } as never)
    useMaterialDraft.getState().setWarehouses(['w1'])
    await show()
    await fireEvent.press(rowOf('Kho Hai'))
    await pressSheetCancel()
    expect(useMaterialDraft.getState().warehouses).toEqual(['w1'])
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('thiếu quyền gắn kho → back, không request', async () => {
    useAuthStore.setState({ user: user([W1, W2], 'MATERIAL_UPDATE') } as never)
    await show()
    expect(mockBack).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })
})
