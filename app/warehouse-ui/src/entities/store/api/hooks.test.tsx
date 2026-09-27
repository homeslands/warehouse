import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { mutationToastQueryClient } from '@/shared/test/query-client'
import { renderWithProviders } from '@/shared/test/render'
import {
  useAssignStoreWarehouse,
  useCreateStore,
  useDeleteStore,
  useStore,
  useStores,
  useUpdateStore,
} from './hooks'
import { storeKeys } from './query-keys'
import type { Store } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const store: Store = {
  slug: 'ch-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Cửa hàng Hà Nội 1',
  code: 'ST-HN-01',
  legalName: 'Công ty TNHH ABC',
  taxCode: '0101234567',
  isActive: true,
}

/** Gọi đủ 5 hook trong một cây để mỗi test chỉ bấm đúng nút mình quan tâm. */
function Probe() {
  const list = useStores({ page: 1, size: 10 })
  const create = useCreateStore()
  const update = useUpdateStore()
  const remove = useDeleteStore()
  const assign = useAssignStoreWarehouse()

  return (
    <div>
      <output data-testid="names">{(list.data?.items ?? []).map((s) => s.name).join(',')}</output>
      <button
        onClick={() =>
          create.mutate({
            code: 'ST-HN-02',
            name: 'Cửa hàng 2',
            legalName: 'Công ty TNHH XYZ',
            taxCode: '0101234567-001',
            isActive: true,
          })
        }
      >
        create
      </button>
      <button onClick={() => update.mutate({ slug: 'ch-ha-noi', input: { isActive: false } })}>
        update
      </button>
      <button onClick={() => remove.mutate('ch-ha-noi')}>remove</button>
      <button onClick={() => assign.mutate({ slug: 'ch-ha-noi', input: { warehouseSlug: null } })}>
        assign
      </button>
      {/* Trạng thái mutation để test chờ mutation ĐÃ lỗi xong trước khi khẳng định invalidate
          không được gọi. */}
      <output data-testid="update-status">{update.status}</output>
      <output data-testid="assign-status">{assign.status}</output>
    </div>
  )
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  server.use(mswHttp.get(`${BASE}/stores`, () => paginated([store])))
})

describe('useStores', () => {
  it('query key gồm cả bộ lọc — đổi bộ lọc là một mục cache khác', () => {
    expect(storeKeys.list({ page: 1, size: 10, isActive: true })).toEqual([
      'stores',
      'list',
      { page: 1, size: 10, isActive: true },
    ])
    expect(storeKeys.lists()).toEqual(['stores', 'list'])
  })

  it('tải danh sách và ghi vào cache theo key của danh sách', async () => {
    const { queryClient } = renderWithProviders(<Probe />)

    expect(await screen.findByText('Cửa hàng Hà Nội 1')).toBeInTheDocument()
    expect(queryClient.getQueryData(storeKeys.list({ page: 1, size: 10 }))).toBeDefined()
  })
})

describe('mutation cửa hàng', () => {
  it.each([
    ['create', 'post', `${BASE}/stores`, 'Đã tạo cửa hàng'],
    ['update', 'patch', `${BASE}/stores/ch-ha-noi`, 'Đã cập nhật cửa hàng'],
    ['remove', 'delete', `${BASE}/stores/ch-ha-noi`, 'Đã xoá cửa hàng'],
    ['assign', 'put', `${BASE}/stores/ch-ha-noi/warehouse`, 'Đã cập nhật kho của cửa hàng'],
  ] as const)(
    '%s: thành công thì toast và tải lại danh sách',
    async (name, method, url, message) => {
      server.use(mswHttp[method](url, () => ok(store)))
      const { user, queryClient } = renderWithProviders(<Probe />)
      await screen.findByText('Cửa hàng Hà Nội 1')
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

      await user.click(screen.getByRole('button', { name }))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message))
      expect(invalidate).toHaveBeenCalledWith({ queryKey: storeKeys.all })
    },
  )

  it.each(['create', 'update', 'assign'] as const)(
    '%s: KHÔNG tự toast lỗi (form/dialog tự hiện lỗi tại ô) — meta.suppressErrorToast',
    async (name) => {
      const routes = {
        create: mswHttp.post(`${BASE}/stores`, () => apiError(422, 101006)),
        update: mswHttp.patch(`${BASE}/stores/ch-ha-noi`, () => apiError(422, 101003)),
        assign: mswHttp.put(`${BASE}/stores/ch-ha-noi/warehouse`, () => apiError(422, 101019)),
      }
      server.use(routes[name])
      // Client mặc định không có MutationCache.onError — trên nó khẳng định "không toast" đúng sẵn
      // kể cả khi hook mất `meta`. Phải là client mang chốt chặn toast như app thì mới kiểm được.
      const { user } = renderWithProviders(<Probe />, {
        queryClient: mutationToastQueryClient(),
      })
      await screen.findByText('Cửa hàng Hà Nội 1')

      await user.click(screen.getByRole('button', { name }))

      await waitFor(() => expect(toast.success).not.toHaveBeenCalled())
      expect(toast.error).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['update', 'patch', `${BASE}/stores/ch-ha-noi`, 101003],
    ['assign', 'put', `${BASE}/stores/ch-ha-noi/warehouse`, 101019],
  ] as const)(
    '%s lỗi → KHÔNG tự tải lại danh sách (bên gọi tự xử lý)',
    async (name, method, url, code) => {
      server.use(mswHttp[method](url, () => apiError(422, code)))
      const { user, queryClient } = renderWithProviders(<Probe />)
      await screen.findByText('Cửa hàng Hà Nội 1')
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

      await user.click(screen.getByRole('button', { name }))

      // Chờ mutation lỗi XONG (status 'error') rồi mới khẳng định — nếu chỉ waitFor "not called"
      // ngay sau khi bấm thì assertion đúng ngay cả khi hook không có chốt gì cả.
      await waitFor(() => expect(screen.getByTestId(`${name}-status`)).toHaveTextContent('error'))
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: storeKeys.all })
    },
  )
})

function StoreDetailProbe() {
  const detail = useStore('ch-ha-noi')
  return <output data-testid="detail">{detail.data?.name ?? detail.status}</output>
}

describe('useStore', () => {
  it('tải chi tiết theo slug', async () => {
    server.use(mswHttp.get(`${BASE}/stores/ch-ha-noi`, () => ok(store)))
    renderWithProviders(<StoreDetailProbe />)

    expect(await screen.findByText(store.name)).toBeInTheDocument()
  })
})
