import { act, renderHook } from '@testing-library/react-native'

import { useLineFocus } from './line-focus'
import { useComposeLineOpen } from './useComposeLineOpen'

const mockNavigate = jest.fn()
/** Màn có đang được focus không (sheet đè lên → false) + các listener 'focus' của navigation. */
const mockNav = { focused: true, listeners: new Set<() => void>() }
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  useNavigation: () => ({
    isFocused: () => mockNav.focused,
    addListener: (event: string, fn: () => void) => {
      if (event !== 'focus') return () => {}
      mockNav.listeners.add(fn)
      return () => mockNav.listeners.delete(fn)
    },
  }),
}))

/** Một màn soạn (loại `kind`, phiếu 'new') có đúng các dòng `keys`; sheet dòng = `/line?key=`. */
async function mount(kind: 'import' | 'export', keys: string[]) {
  return renderHook(() =>
    useComposeLineOpen({
      kind,
      formSlug: 'new',
      href: (key, { justAdded }) =>
        keys.includes(key)
          ? { pathname: '/line', params: justAdded ? { key, focus: 'quantity' } : { key } }
          : null,
    }),
  )
}

const frames = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))))
const refocus = () => act(async () => mockNav.listeners.forEach((fn) => fn()))

beforeEach(() => {
  mockNavigate.mockClear()
  mockNav.focused = true
  mockNav.listeners.clear()
  useLineFocus.getState().clear()
})

describe('useComposeLineOpen', () => {
  it('openLine(key) mở sheet của dòng ngay (không tự focus ô số)', async () => {
    const { result } = await mount('export', ['a'])
    await act(async () => result.current.openLine('a'))
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/line', params: { key: 'a' } })
  })

  it('yêu cầu từ sheet (sheet còn đè) → CHỜ màn được focus lại rồi mở sheet dòng đó với focus=quantity, MỘT lần', async () => {
    await mount('export', ['a', 'b'])
    mockNav.focused = false
    await act(async () => useLineFocus.getState().ask('export', 'new', 'b'))
    await frames()
    expect(mockNavigate).not.toHaveBeenCalled()
    mockNav.focused = true
    await refocus()
    await frames()
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/line',
      params: { key: 'b', focus: 'quantity' },
    })
    // Yêu cầu tiêu thụ đúng một lần: màn được focus lại (vd quay về từ bước 3) không mở lại.
    expect(useLineFocus.getState().request).toBeNull()
    await refocus()
    await frames()
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  it('màn đang được focus sẵn → mở ngay (qua một khung hình)', async () => {
    await mount('import', ['m-1|u-1'])
    await act(async () => useLineFocus.getState().ask('import', 'new', 'm-1|u-1'))
    await frames()
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/line',
      params: { key: 'm-1|u-1', focus: 'quantity' },
    })
  })

  it('dòng không còn (href null) → không mở, vẫn bỏ yêu cầu', async () => {
    await mount('export', [])
    await act(async () => useLineFocus.getState().ask('export', 'new', 'x'))
    await frames()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(useLineFocus.getState().request).toBeNull()
  })

  it("yêu cầu của phiếu nhập 'new' chỉ tới màn soạn phiếu nhập; màn phiếu xuất không mở, không xoá", async () => {
    await mount('export', ['x|kg|'])
    mockNav.focused = false
    await act(async () => useLineFocus.getState().ask('import', 'new', 'm-1|u-1'))
    mockNav.focused = true
    await refocus()
    await frames()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(useLineFocus.getState().request).toEqual({
      kind: 'import',
      formSlug: 'new',
      key: 'm-1|u-1',
    })
  })

  it('màn soạn phiếu xuất rời đi không xoá yêu cầu còn treo của phiếu nhập; rời màn bỏ yêu cầu của chính nó', async () => {
    const exp = await mount('export', [])
    await act(async () => useLineFocus.getState().ask('import', 'new', 'm-1|u-1'))
    await act(async () => exp.unmount())
    expect(useLineFocus.getState().request).not.toBeNull()

    mockNav.focused = false
    const imp = await mount('import', ['m-1|u-1'])
    await act(async () => imp.unmount())
    expect(useLineFocus.getState().request).toBeNull()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
