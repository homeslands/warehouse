// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { resetFakeApi } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { useAuthStore } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { ExportFilterSheetScreen } from './ExportFilterSheetScreen'
import { useExportListFilter } from './export-list.store'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: (props: object) => <View {...props} />,
    DateTimePickerAndroid: { open: jest.fn() },
  }
})

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const show = () =>
  render(
    <QueryClientProvider client={client}>
      <ExportFilterSheetScreen />
    </QueryClientProvider>,
  )

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  useExportListFilter.getState().reset()
  useAuthStore.setState({
    status: 'authenticated',
    user: { userSlug: 'u-1', userName: 'an', scope: ['EXPORT_FORM_READ'] } as never,
  })
})

describe('ExportFilterSheetScreen', () => {
  it('có thẻ Thời gian, Người lập và thẻ "Loại" (tắt)', async () => {
    await show()
    expect(screen.getByTestId('export-filter-sheet')).toBeOnTheScreen()
    expect(screen.getByRole('switch', { name: 'Thời gian' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Người lập' })).toBeOnTheScreen()
    expect(screen.getByRole('switch', { name: 'Loại' })).not.toBeChecked()
    expect(screen.queryByRole('radio', { name: 'Sản xuất' })).toBeNull()
  })

  it('bật "Loại" → 5 viên, mặc định Sản xuất được chọn và gửi đi; chọn viên khác → đổi type', async () => {
    await show()
    await act(async () =>
      fireEvent(screen.getByRole('switch', { name: 'Loại' }), 'valueChange', true),
    )
    for (const name of ['Sản xuất', 'Bán', 'Chuyển kho', 'Huỷ', 'Khác'])
      expect(screen.getByRole('radio', { name })).toBeOnTheScreen()
    expect(useExportListFilter.getState().type).toBe('PRODUCTION')
    await fireEvent.press(screen.getByRole('radio', { name: 'Chuyển kho' }))
    expect(useExportListFilter.getState().type).toBe('TRANSFER')
    expect(screen.getByRole('radio', { name: 'Chuyển kho' })).toBeSelected()
  })

  it('tắt "Loại" → type về null', async () => {
    useExportListFilter.setState({ type: 'SALE' })
    await show()
    expect(screen.getByRole('switch', { name: 'Loại' })).toBeChecked()
    await act(async () =>
      fireEvent(screen.getByRole('switch', { name: 'Loại' }), 'valueChange', false),
    )
    expect(useExportListFilter.getState().type).toBeNull()
  })

  it('"Xoá lọc" hiện khi chỉ có Loại, xoá cả Loại lẫn chip, giữ ô tìm và trạng thái', async () => {
    useExportListFilter.setState({ type: 'SALE', status: 'DRAFT', query: 'px' })
    await show()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Xoá lọc' })))
    expect(useExportListFilter.getState()).toMatchObject({
      type: null,
      time: null,
      status: 'DRAFT',
      query: 'px',
    })
    expect(screen.queryByRole('button', { name: 'Xoá lọc' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Loại' })).not.toBeChecked()
  })

  it('thời gian như tab Nhập: bật → 7 ngày qua', async () => {
    await show()
    await act(async () =>
      fireEvent(screen.getByRole('switch', { name: 'Thời gian' }), 'valueChange', true),
    )
    expect(useExportListFilter.getState().time).toBe('last7')
  })
})
