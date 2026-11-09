import { renderHook } from '@testing-library/react-native'

import { useLeaveOnWarehouseChange } from './useLeaveOnWarehouseChange'

type StackState = { index: number; routes: { key: string }[] }
const mockNav = {
  dispatch: jest.fn(),
  state: { index: 1, routes: [{ key: 'list' }, { key: 'me' }] } as StackState,
}
const mockRoute = { key: 'me' }
jest.mock('expo-router', () => ({
  useNavigation: () => ({ dispatch: mockNav.dispatch, getState: () => mockNav.state }),
  useRoute: () => mockRoute,
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockNav.state = { index: 1, routes: [{ key: 'list' }, { key: 'me' }] }
  mockRoute.key = 'me'
})

async function mount(initial: string | undefined) {
  return renderHook(({ wh }: { wh: string | undefined }) => useLeaveOnWarehouseChange(wh), {
    initialProps: { wh: initial },
  })
}

describe('useLeaveOnWarehouseChange', () => {
  it('lần hiện đầu không điều hướng', async () => {
    await mount('wh-a')
    expect(mockNav.dispatch).not.toHaveBeenCalled()
  })

  it('màn ở đỉnh Stack của nó, kho đổi → popToTop đúng một lần', async () => {
    const { rerender } = await mount('wh-a')
    await rerender({ wh: 'wh-b' })
    expect(mockNav.dispatch).toHaveBeenCalledTimes(1)
    expect(mockNav.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'POP_TO_TOP' }))
    // Render lại cùng kho → không dispatch thêm.
    await rerender({ wh: 'wh-b' })
    expect(mockNav.dispatch).toHaveBeenCalledTimes(1)
  })

  it('có màn khác nằm trên trong cùng Stack (vd màn kiểm trên màn xem) → màn dưới KHÔNG dispatch', async () => {
    mockNav.state = { index: 2, routes: [{ key: 'list' }, { key: 'me' }, { key: 'receive' }] }
    const { rerender } = await mount('wh-a')
    await rerender({ wh: 'wh-b' })
    expect(mockNav.dispatch).not.toHaveBeenCalled()
  })

  it('màn là gốc của Stack (index 0) → không có gì để lùi, không dispatch', async () => {
    mockNav.state = { index: 0, routes: [{ key: 'me' }] }
    const { rerender } = await mount('wh-a')
    await rerender({ wh: 'wh-b' })
    expect(mockNav.dispatch).not.toHaveBeenCalled()
  })

  it('kho bị xoá (hết phiên) → để SessionGate lo, không dispatch', async () => {
    const { rerender } = await mount('wh-a')
    await rerender({ wh: undefined })
    expect(mockNav.dispatch).not.toHaveBeenCalled()
  })
})
