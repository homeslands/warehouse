import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native'

import { failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { changeLanguage, initI18n } from '@/shared/i18n'
import { SafeAreaWrapper } from '@/shared/ui/testing/safe-area'

import { useMaterialFilter } from './filter-store'
import { MaterialScanScreen } from './MaterialScanScreen'

const mockBack = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, canGoBack: () => true }),
  Stack: { Screen: () => null },
}))
const camera = jest.requireMock('expo-camera').__permission as { reset: () => void }

const material = (slug: string, code: string) => ({
  slug,
  code,
  name: `Vật tư ${code}`,
  type: { slug: 't1', code: 'XD', name: 'Xây dựng' },
  baseUnit: { slug: 'bao', code: 'BAO', name: 'Bao' },
})
const page = (items: object[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 5, totalPages: 1, hasNext: false })

const scan = (data: string) =>
  fireEvent(screen.getByTestId('camera-view'), 'barcodeScanned', { data, type: 'code128' })
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)))

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  jest.clearAllMocks()
  camera.reset()
  resetFakeApi()
  useMaterialFilter.getState().reset()
})
afterEach(() => cleanup())

describe('MaterialScanScreen', () => {
  it('mã khớp đúng một vật tư (không phân biệt hoa thường) → đóng rồi mở chi tiết; không ghi ô tìm', async () => {
    const codes: unknown[] = []
    route('get', '/materials', (c) => {
      codes.push((c.params as { code: string }).code)
      // Lọc BE là tiền tố: trả cả mã dài hơn — máy phải so khớp chính xác.
      return page([material('m-long', 'VT091'), material('m-1', 'VT09')])
    })
    await render(<MaterialScanScreen />, { wrapper: SafeAreaWrapper })
    await scan(' vt09 ')
    await settle()
    expect(codes).toEqual(['VT09'])
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/account/materials/m-1')
    expect(useMaterialFilter.getState().scannedQuery).toBeNull()
  })

  it('nhãn <MÃ>*<SERIAL>: nguyên chuỗi không khớp → tra phần Mã', async () => {
    route('get', '/materials', (c) => {
      const code = (c.params as { code: string }).code
      return page(code === 'VT09' ? [material('m-1', 'VT09')] : [])
    })
    await render(<MaterialScanScreen />, { wrapper: SafeAreaWrapper })
    await scan('VT09*SN001')
    await settle()
    expect(mockPush).toHaveBeenCalledWith('/account/materials/m-1')
  })

  it('không khớp vật tư nào → ghi phần Mã vào ô tìm của danh sách rồi đóng (không mở chi tiết)', async () => {
    route('get', '/materials', () => page([]))
    await render(<MaterialScanScreen />, { wrapper: SafeAreaWrapper })
    await scan('ABC*123')
    await settle()
    expect(useMaterialFilter.getState().scannedQuery).toBe('ABC')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('lỗi mạng khi tra → vẫn ghi mã vào ô tìm (danh sách tự tìm lại)', async () => {
    route('get', '/materials', () => failure(500))
    await render(<MaterialScanScreen />, { wrapper: SafeAreaWrapper })
    await scan('XM01')
    await settle()
    expect(useMaterialFilter.getState().scannedQuery).toBe('XM01')
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('✕ trong lúc đang tra → kết quả về không mở chi tiết, không back thêm', async () => {
    let reply: (r: ReturnType<typeof ok>) => void = () => {}
    route('get', '/materials', () => new Promise((r) => (reply = r)))
    await render(<MaterialScanScreen />, { wrapper: SafeAreaWrapper })
    await scan('VT09')
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }))
    await act(async () => reply(page([material('m-1', 'VT09')])))
    await settle()
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })
})
