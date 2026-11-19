// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { calls, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import type { NativeStackHeaderItem, NativeStackNavigationOptions } from 'expo-router'

import { useAuthStore } from '@/entities/session'
import { changeLanguage, initI18n } from '@/shared/i18n'

import { MaterialListScreen } from './MaterialListScreen'
import { useMaterialFilter } from './filter-store'

const mockPush = jest.fn()
const mockHeader: { options: NativeStackNavigationOptions } = { options: {} }
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  Stack: {
    Screen: ({ options }: { options: NativeStackNavigationOptions }) => {
      mockHeader.options = options
      return null
    },
  },
}))

const baseUser = {
  userName: 'root',
  phonenumber: '0900000001',
  firstName: 'A',
  lastName: 'B',
  roleName: 'MANAGER',
}
const signIn = (scope: string[]) =>
  useAuthStore.setState({
    status: 'authenticated',
    user: { ...baseUser, scope } as never,
    endReason: null,
  })

const material = (slug: string, code: string, name: string) => ({
  slug,
  code,
  name,
  minimumInventory: 0,
  maximumInventory: 0,
  type: { slug: 't1', code: 'XD', name: 'Xây dựng' },
  baseUnit: { slug: 'bao', code: 'BAO', name: 'Bao' },
  hasSupplier: false,
  suppliers: [],
  warehouses: [],
  units: [],
  createdAt: '',
  updatedAt: '',
})

const page = (items: object[], p: number, hasNext: boolean) =>
  ok({
    items,
    total: 60,
    page: p,
    pageSize: 30,
    totalPages: 2,
    hasNext,
    hasPrevious: p > 1,
  })

let client: QueryClient
async function show() {
  await render(
    <QueryClientProvider client={client}>
      <MaterialListScreen />
    </QueryClientProvider>,
  )
  await settle()
}
async function settle() {
  await act(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    await tick()
    for (let n = 0; n < 100 && client.isFetching() > 0; n++) await tick()
    await tick()
  })
}

const rightItems = (): NativeStackHeaderItem[] =>
  mockHeader.options.unstable_headerRightItems?.({ tintColor: undefined, canGoBack: true }) ?? []
const materialGets = () => calls.filter((c) => c.method === 'get' && c.url === '/materials')

beforeAll(async () => {
  await initI18n()
  await changeLanguage('vi')
})

beforeEach(() => {
  jest.clearAllMocks()
  resetFakeApi()
  mockHeader.options = {}
  useMaterialFilter.getState().reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  signIn(['MATERIAL_READ'])
  route('get', '/material-types', () =>
    ok({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 0,
      hasNext: false,
      hasPrevios: false,
    }),
  )
})

describe('MaterialListScreen', () => {
  it('(a) cuộn tới cuối → GET trang 2, dòng trang 2 hiện', async () => {
    const pages: unknown[] = []
    route('get', '/materials', (c) => {
      const p = (c.params as { page: number }).page
      pages.push(p)
      return p === 1
        ? page([material('m1', 'XM', 'Xi măng')], 1, true)
        : page([material('m2', 'GA', 'Gạch ống')], 2, false)
    })
    await show()
    expect(screen.getByText('Xi măng')).toBeOnTheScreen()
    expect(screen.queryByText('Gạch ống')).toBeNull()
    await act(async () => fireEvent(screen.getByTestId('material-list'), 'onEndReached'))
    await settle()
    expect(pages).toEqual([1, 2])
    expect(screen.getByText('Gạch ống')).toBeOnTheScreen()
  })

  it('dòng: tên, mã · tên loại, mã đơn vị gốc; chạm → push chi tiết', async () => {
    route('get', '/materials', () => page([material('m1', 'XM', 'Xi măng')], 1, false))
    await show()
    expect(screen.getByText('BAO')).toBeOnTheScreen()
    expect(screen.getByText(/· Xây dựng/)).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: /Xi măng/ }))
    expect(mockPush).toHaveBeenCalledWith('/account/materials/m1')
  })

  it('(b) gõ "#" → câu searchInvalid, không request tìm', async () => {
    route('get', '/materials', () => page([material('m1', 'XM', 'Xi măng')], 1, false))
    await show()
    const before = materialGets().length
    await act(async () => fireEvent.changeText(screen.getByLabelText('Tìm theo mã hoặc tên'), '#'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })
    await settle()
    expect(screen.getByText(/chỉ gồm ký tự đặc biệt/)).toBeOnTheScreen()
    expect(materialGets()).toHaveLength(before)
  })

  it('(c) chọn loại trong store → request có typeSlug', async () => {
    const seen: unknown[] = []
    route('get', '/materials', (c) => {
      seen.push((c.params as { typeSlug?: string }).typeSlug)
      return page([material('m1', 'XM', 'Xi măng')], 1, false)
    })
    await show()
    await act(async () =>
      useMaterialFilter.getState().setType({ slug: 't1', code: 'XD', name: 'Xây dựng' }),
    )
    await settle()
    expect(seen).toContain('t1')
  })

  it('(d) thiếu MATERIAL_READ → noAccess, 0 request', async () => {
    signIn(['UNIT_READ'])
    route('get', '/materials', () => page([], 1, false))
    await show()
    expect(screen.getByText('Bạn không có quyền xem mục này.')).toBeOnTheScreen()
    expect(calls.filter((c) => c.url.startsWith('/material'))).toHaveLength(0)
  })

  it('(e) MATERIAL_CREATE + UNIT_READ → nút + trong header (cạnh nút Lọc); thiếu UNIT_READ → không', async () => {
    route('get', '/materials', () => page([], 1, false))
    signIn(['MATERIAL_READ', 'MATERIAL_CREATE', 'UNIT_READ'])
    await show()
    const items = rightItems() as { label?: string; onPress: () => void }[]
    expect(items.map((i) => i.label)).toEqual(['Quét mã', 'Lọc', 'Thêm vật tư'])
    await act(async () => items[0].onPress())
    expect(mockPush).toHaveBeenLastCalledWith('/scan-catalog-material')
    await act(async () => items[1].onPress())
    expect(mockPush).toHaveBeenLastCalledWith('/material-filter')
    await act(async () => items[2].onPress())
    expect(mockPush).toHaveBeenLastCalledWith('/material-form')
  })

  it('(e2) thiếu UNIT_READ → header chỉ có nút Quét mã + Lọc', async () => {
    route('get', '/materials', () => page([], 1, false))
    signIn(['MATERIAL_READ', 'MATERIAL_CREATE'])
    await show()
    expect((rightItems() as { label?: string }[]).map((i) => i.label)).toEqual(['Quét mã', 'Lọc'])
  })

  it('mã quét không khớp (scannedQuery) → điền vào ô tìm, danh sách tìm theo mã đó, rồi xoá khỏi store', async () => {
    const queries: unknown[] = []
    route('get', '/materials', (c) => {
      const p = c.params as { code?: string; name?: string }
      queries.push(p.code ?? p.name ?? null)
      return page([], 1, false)
    })
    signIn(['MATERIAL_READ'])
    await show()
    await act(async () => useMaterialFilter.getState().setScannedQuery('XM99'))
    await act(async () => new Promise((r) => setTimeout(r, 400)))
    await settle()
    expect(screen.getByDisplayValue('XM99')).toBeOnTheScreen()
    expect(queries).toContain('XM99')
    expect(useMaterialFilter.getState().scannedQuery).toBeNull()
  })

  it('rỗng: không lọc → empty (+ gợi ý khi có quyền tạo); có lọc → noResults', async () => {
    route('get', '/materials', () => page([], 1, false))
    signIn(['MATERIAL_READ', 'MATERIAL_CREATE', 'UNIT_READ'])
    await show()
    expect(screen.getByText('Chưa có vật tư nào')).toBeOnTheScreen()
    expect(screen.getByText('Vật tư được tạo sẽ hiện ở đây.')).toBeOnTheScreen()
    await act(async () =>
      useMaterialFilter.getState().setType({ slug: 't1', code: 'XD', name: 'Xây dựng' }),
    )
    await settle()
    expect(screen.getByText('Không có kết quả phù hợp')).toBeOnTheScreen()
  })

  it('trang sau lỗi → dòng cuối "Thử lại" tải lại trang đó', async () => {
    let fail = true
    route('get', '/materials', (c) => {
      const p = (c.params as { page: number }).page
      if (p === 1) return page([material('m1', 'XM', 'Xi măng')], 1, true)
      return fail
        ? {
            status: 500,
            data: { statusCode: 500, message: 'x', timestamp: '', path: '', method: 'GET' },
          }
        : page([material('m2', 'GA', 'Gạch ống')], 2, false)
    })
    await show()
    await act(async () => fireEvent(screen.getByTestId('material-list'), 'onEndReached'))
    await settle()
    expect(screen.getByText('Không tải thêm được')).toBeOnTheScreen()
    fail = false
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }))
    await settle()
    expect(screen.getByText('Gạch ống')).toBeOnTheScreen()
  })
})
