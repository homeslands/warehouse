import { renderHook } from '@testing-library/react-native'

import { useAppearance } from './appearance'
import { useTheme } from './useTheme'

const mockScheme = jest.fn()
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme(),
}))

beforeEach(() => useAppearance.setState({ preference: 'system' }))

describe('useTheme', () => {
  it('chọn "Tối" thì dùng bảng tối dù máy đang sáng', async () => {
    mockScheme.mockReturnValue('light')
    useAppearance.setState({ preference: 'dark' })
    const { result } = await renderHook(() => useTheme())
    expect(result.current.scheme).toBe('dark')
    expect(result.current.colors.background).toBe('#0a0a0a')
  })

  it('chọn "Sáng" thì dùng bảng sáng dù máy đang tối', async () => {
    mockScheme.mockReturnValue('dark')
    useAppearance.setState({ preference: 'light' })
    const { result } = await renderHook(() => useTheme())
    expect(result.current.scheme).toBe('light')
  })

  it('uses dark palette when scheme is dark', async () => {
    mockScheme.mockReturnValue('dark')
    const { result } = await renderHook(() => useTheme())
    expect(result.current.scheme).toBe('dark')
    expect(result.current.colors.background).toBe('#0a0a0a')
  })

  it('falls back to light palette when scheme is null', async () => {
    mockScheme.mockReturnValue(null)
    const { result } = await renderHook(() => useTheme())
    expect(result.current.scheme).toBe('light')
    expect(result.current.colors.background).toBe('#ffffff')
  })
})
