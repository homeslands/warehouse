import { renderHook } from '@testing-library/react-native'

import { useCloseSheet } from './useCloseSheet'

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() }
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }))

beforeEach(() => jest.clearAllMocks())

describe('useCloseSheet', () => {
  it('còn màn bên dưới → back()', async () => {
    mockRouter.canGoBack.mockReturnValue(true)
    const { result } = await renderHook(() => useCloseSheet())
    result.current()
    expect(mockRouter.back).toHaveBeenCalledTimes(1)
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('không còn màn bên dưới → replace("/") để SessionGate đưa tới đích hiện tại', async () => {
    mockRouter.canGoBack.mockReturnValue(false)
    const { result } = await renderHook(() => useCloseSheet())
    result.current()
    expect(mockRouter.replace).toHaveBeenCalledWith('/')
    expect(mockRouter.back).not.toHaveBeenCalled()
  })
})
