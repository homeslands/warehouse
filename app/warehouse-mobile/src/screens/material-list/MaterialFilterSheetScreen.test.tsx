// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native'

import { useAuthStore } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { MaterialFilterSheetScreen } from './MaterialFilterSheetScreen'

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  usePreventRemove: () => jest.fn(),
  Stack: jest.requireActual('@/shared/ui/testing/sheet-header').mockSheetStack,
}))

let client: QueryClient
async function settled() {
  await act(async () => {
    for (let n = 0; n < 5; n++) await new Promise((r) => setTimeout(r, 0))
  })
}

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})
beforeEach(() => {
  resetFakeApi()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  useAuthStore.setState({
    user: { userName: 'u', roleName: 'STAFF', scope: ['MATERIAL_READ'] },
  } as never)
})
afterEach(async () => {
  await cleanup()
  client.clear()
  useAuthStore.setState({ user: null } as never)
})

describe('MaterialFilterSheetScreen', () => {
  it('tải loại lỗi → câu lỗi + Thử lại; bấm Thử lại gọi lại API', async () => {
    route('get', '/material-types', () => 'network')
    await render(
      <QueryClientProvider client={client}>
        <MaterialFilterSheetScreen />
      </QueryClientProvider>,
    )
    await settled()
    expect(screen.getByText('Không tải được dữ liệu')).toBeOnTheScreen()
    expect(screen.getByText('Thử lại')).toBeOnTheScreen()
    const before = calls.length
    await fireEvent.press(screen.getByText('Thử lại'))
    await settled()
    expect(calls.length).toBeGreaterThan(before)
  })
})
