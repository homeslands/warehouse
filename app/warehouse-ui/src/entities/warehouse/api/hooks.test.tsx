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
  useAssignWarehouseManager,
  useCreateWarehouse,
  useDeleteWarehouse,
  useUpdateWarehouse,
  useWarehouse,
  useWarehouses,
} from './hooks'
import { warehouseKeys } from './query-keys'
import type { Warehouse } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const warehouse: Warehouse = {
  slug: 'kho-ha-noi',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  name: 'Kho Hà Nội 1',
  code: 'WH-HN-01',
  address: 'Số 1, Cầu Giấy, Hà Nội',
  isActive: true,
}

/** Gọi đủ 5 hook trong một cây để mỗi test chỉ bấm đúng nút mình quan tâm. */
function Probe() {
  const list = useWarehouses({ page: 1, size: 10 })
  const create = useCreateWarehouse()
  const update = useUpdateWarehouse()
  const remove = useDeleteWarehouse()
  const assign = useAssignWarehouseManager()

  return (
    <div>
      <output data-testid="names">{(list.data?.items ?? []).map((w) => w.name).join(',')}</output>
      <button
        onClick={() =>
          create.mutate({ code: 'WH-HN-02', name: 'Kho 2', address: 'Hà Nội', isActive: true })
        }
      >
        create
      </button>
      <button onClick={() => update.mutate({ slug: 'kho-ha-noi', input: { isActive: false } })}>
        update
      </button>
      <button onClick={() => remove.mutate('kho-ha-noi')}>remove</button>
      <button onClick={() => assign.mutate({ slug: 'kho-ha-noi', input: { managerSlug: null } })}>
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
  server.use(mswHttp.get(`${BASE}/warehouses`, () => paginated([warehouse])))
})

describe('useWarehouses', () => {
  it('query key gồm cả bộ lọc — đổi bộ lọc là một mục cache khác', () => {
    expect(warehouseKeys.list({ page: 1, size: 10, isActive: true })).toEqual([
      'warehouses',
      'list',
      { page: 1, size: 10, isActive: true },
    ])
    expect(warehouseKeys.lists()).toEqual(['warehouses', 'list'])
  })

  it('tải danh sách và ghi vào cache theo key của danh sách', async () => {
    const { queryClient } = renderWithProviders(<Probe />)

    expect(await screen.findByText('Kho Hà Nội 1')).toBeInTheDocument()
    expect(queryClient.getQueryData(warehouseKeys.list({ page: 1, size: 10 }))).toBeDefined()
  })
})

describe('mutation kho', () => {
  it.each([
    ['create', 'post', `${BASE}/warehouses`, 'Đã tạo kho'],
    ['update', 'patch', `${BASE}/warehouses/kho-ha-noi`, 'Đã cập nhật kho'],
    ['remove', 'delete', `${BASE}/warehouses/kho-ha-noi`, 'Đã xoá kho'],
    ['assign', 'put', `${BASE}/warehouses/kho-ha-noi/manager`, 'Đã cập nhật quản lý kho'],
  ] as const)(
    '%s: thành công thì toast và tải lại danh sách',
    async (name, method, url, message) => {
      server.use(mswHttp[method](url, () => ok(warehouse)))
      const { user, queryClient } = renderWithProviders(<Probe />)
      await screen.findByText('Kho Hà Nội 1')
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

      await user.click(screen.getByRole('button', { name }))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message))
      expect(invalidate).toHaveBeenCalledWith({ queryKey: warehouseKeys.all })
    },
  )

  it.each(['create', 'update', 'assign'] as const)(
    '%s: KHÔNG tự toast lỗi (form/dialog tự hiện lỗi tại ô) — meta.suppressErrorToast',
    async (name) => {
      const routes = {
        create: mswHttp.post(`${BASE}/warehouses`, () => apiError(422, 100506)),
        update: mswHttp.patch(`${BASE}/warehouses/kho-ha-noi`, () => apiError(422, 100503)),
        assign: mswHttp.put(`${BASE}/warehouses/kho-ha-noi/manager`, () => apiError(422, 100516)),
      }
      server.use(routes[name])
      // Client mặc định không có MutationCache.onError — trên nó khẳng định "không toast" đúng sẵn
      // kể cả khi hook mất `meta`. Phải là client mang chốt chặn toast như app thì mới kiểm được.
      const { user } = renderWithProviders(<Probe />, {
        queryClient: mutationToastQueryClient(),
      })
      await screen.findByText('Kho Hà Nội 1')

      await user.click(screen.getByRole('button', { name }))

      await waitFor(() => expect(toast.success).not.toHaveBeenCalled())
      expect(toast.error).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['update', 'patch', `${BASE}/warehouses/kho-ha-noi`, 100503],
    ['assign', 'put', `${BASE}/warehouses/kho-ha-noi/manager`, 100516],
  ] as const)(
    '%s lỗi → KHÔNG tự tải lại danh sách (bên gọi tự xử lý)',
    async (name, method, url, code) => {
      server.use(mswHttp[method](url, () => apiError(422, code)))
      const { user, queryClient } = renderWithProviders(<Probe />)
      await screen.findByText('Kho Hà Nội 1')
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

      await user.click(screen.getByRole('button', { name }))

      // Chờ mutation lỗi XONG (status 'error') rồi mới khẳng định — nếu chỉ waitFor "not called"
      // ngay sau khi bấm thì assertion đúng ngay cả khi hook không có chốt gì cả.
      await waitFor(() => expect(screen.getByTestId(`${name}-status`)).toHaveTextContent('error'))
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: warehouseKeys.all })
    },
  )
})

function DetailProbe({ slug }: { slug: string }) {
  const detail = useWarehouse(slug)
  return <output data-testid="detail">{detail.data?.name ?? detail.status}</output>
}

describe('useWarehouse', () => {
  it('useWarehouse tải chi tiết theo slug', async () => {
    server.use(mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () => ok(warehouse)))
    renderWithProviders(<DetailProbe slug="kho-ha-noi" />)

    expect(await screen.findByText('Kho Hà Nội 1')).toBeInTheDocument()
  })

  it('sửa kho thì chi tiết tải lại (khoá detail nằm dưới warehouseKeys.all)', async () => {
    let name = 'Kho Hà Nội 1'
    server.use(
      mswHttp.get(`${BASE}/warehouses/kho-ha-noi`, () => ok({ ...warehouse, name })),
      mswHttp.patch(`${BASE}/warehouses/kho-ha-noi`, () => {
        name = 'Kho Hà Nội 1B'
        return ok({ ...warehouse, name })
      }),
    )
    const { user } = renderWithProviders(
      <>
        <DetailProbe slug="kho-ha-noi" />
        <Probe />
      </>,
    )
    await screen.findByText('Kho Hà Nội 1')

    await user.click(screen.getByRole('button', { name: 'update' }))

    expect(await screen.findByText('Kho Hà Nội 1B')).toBeInTheDocument()
  })
})
