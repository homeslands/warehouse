import { act, fireEvent, render, screen } from '@testing-library/react-native'

import type { InventoryItem } from '@/entities/inventory'
import { item } from '@/entities/inventory/model/fixtures'
import { useAuthStore, type CurrentUser } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { StockHero } from './StockHero'

const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}))

const WITH: InventoryItem = item({
  materialSlug: 'xm',
  effectiveMinimumInventory: 200,
  effectiveMaximumInventory: 800,
})
const WITHOUT: InventoryItem = item({
  materialSlug: 'xm',
  effectiveMinimumInventory: 0,
  effectiveMaximumInventory: 0,
})

const asUser = (scope: string[]): CurrentUser => ({ userName: 'u', roleName: 'STAFF', scope })
const BOTH = ['MATERIAL_UPDATE', 'WAREHOUSE_UPDATE']

async function show(it: InventoryItem, scope: string[], compact = false) {
  useAuthStore.setState({ user: asUser(scope) })
  await render(<StockHero item={it} locale="vi" compact={compact} />)
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => jest.clearAllMocks())
afterEach(() => useAuthStore.setState({ user: null }))

describe('StockHero — nút sửa ngưỡng', () => {
  it('đủ quyền + có ngưỡng → nút "Sửa ngưỡng tồn" mở sheet với materialSlug', async () => {
    await show(WITH, BOTH)
    expect(screen.queryByRole('button', { name: 'Đặt ngưỡng tồn' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Sửa ngưỡng tồn' }))
    await act(async () => {})
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/stock-threshold',
      params: { materialSlug: 'xm' },
    })
  })

  it('đủ quyền + chưa có ngưỡng → dòng "Đặt ngưỡng tồn"', async () => {
    await show(WITHOUT, BOTH)
    expect(screen.queryByRole('button', { name: 'Sửa ngưỡng tồn' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Đặt ngưỡng tồn' }))
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/stock-threshold',
      params: { materialSlug: 'xm' },
    })
  })

  it.each([[['MATERIAL_UPDATE']], [['WAREHOUSE_UPDATE']], [[]]])(
    'thiếu quyền (%j) → không có nút nào',
    async (scope) => {
      await show(WITH, scope)
      expect(screen.queryByRole('button', { name: 'Sửa ngưỡng tồn' })).toBeNull()
      await screen.unmount()
      await show(WITHOUT, scope)
      expect(screen.queryByRole('button', { name: 'Đặt ngưỡng tồn' })).toBeNull()
    },
  )

  it('thẻ thu gọn (tab Lịch sử) → không có nút', async () => {
    await show(WITH, BOTH, true)
    expect(screen.queryByRole('button', { name: 'Sửa ngưỡng tồn' })).toBeNull()
  })
})
