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
  useAllSupplierMaterials,
  useAttachSupplierMaterial,
  useCreateSupplier,
  useCreateSupplierTransaction,
  useDeleteSupplier,
  useDetachSupplierMaterial,
  useSupplier,
  useSupplierMaterials,
  useSupplierTransactions,
  useSuppliers,
  useUpdateSupplier,
} from './hooks'
import { supplierKeys } from './query-keys'
import type { Supplier } from '../model/types'

const BASE = 'http://localhost:8085/api/v1'

const supplier: Supplier = {
  slug: 's-1',
  createdAt: 'Thu Oct 08 2026 09:00:00 GMT+0700',
  updatedAt: 'Thu Oct 08 2026 09:00:00 GMT+0700',
  code: 'NCC-01',
  name: 'Công ty ABC',
}

function Probe() {
  const list = useSuppliers({ page: 1, size: 10 })
  const create = useCreateSupplier()
  const update = useUpdateSupplier()
  const remove = useDeleteSupplier()

  return (
    <div>
      <output data-testid="names">{(list.data?.items ?? []).map((s) => s.name).join(',')}</output>
      <button onClick={() => create.mutate({ code: 'NCC-02', name: 'Công ty XYZ' })}>create</button>
      <button onClick={() => update.mutate({ slug: 's-1', input: { name: 'Mới' } })}>update</button>
      <button onClick={() => remove.mutate('s-1')}>remove</button>
    </div>
  )
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  server.use(mswHttp.get(`${BASE}/suppliers`, () => paginated([supplier])))
})

describe('supplierKeys', () => {
  it('key lồng theo cấp', () => {
    expect(supplierKeys.list({ page: 1, size: 10 })).toEqual([
      'suppliers',
      'list',
      { page: 1, size: 10 },
    ])
    expect(supplierKeys.detail('s-1')).toEqual(['suppliers', 'detail', 's-1'])
    expect(supplierKeys.materials('s-1')).toEqual(['suppliers', 'materials', 's-1'])
    expect(supplierKeys.transactions('s-1')).toEqual(['suppliers', 'transactions', 's-1'])
  })
})

describe('useSuppliers', () => {
  it('tải danh sách và ghi vào cache theo key của danh sách', async () => {
    const { queryClient } = renderWithProviders(<Probe />)

    expect(await screen.findByText('Công ty ABC')).toBeInTheDocument()
    expect(queryClient.getQueryData(supplierKeys.list({ page: 1, size: 10 }))).toBeDefined()
  })
})

describe('mutation nhà cung cấp', () => {
  it.each([
    ['create', 'post', `${BASE}/suppliers`, 'Đã thêm nhà cung cấp'],
    ['update', 'patch', `${BASE}/suppliers/s-1`, 'Đã lưu nhà cung cấp'],
    ['remove', 'delete', `${BASE}/suppliers/s-1`, 'Đã xoá nhà cung cấp'],
  ] as const)('%s: thành công thì toast và tải lại', async (name, method, url, message) => {
    server.use(mswHttp[method](url, () => ok(supplier)))
    const { user, queryClient } = renderWithProviders(<Probe />)
    await screen.findByText('Công ty ABC')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message))
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: name === 'remove' ? supplierKeys.lists() : supplierKeys.all,
    })
    // Xoá không được làm mới detail/materials/transactions của bản ghi vừa xoá (sẽ 404).
    if (name === 'remove')
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: supplierKeys.all })
  })

  it.each(['create', 'update', 'remove'] as const)(
    '%s lỗi: KHÔNG tự toast (meta.suppressErrorToast)',
    async (name) => {
      const routes = {
        create: mswHttp.post(`${BASE}/suppliers`, () => apiError(422, 101200)),
        update: mswHttp.patch(`${BASE}/suppliers/s-1`, () => apiError(422, 101200)),
        remove: mswHttp.delete(`${BASE}/suppliers/s-1`, () => apiError(422, 101211)),
      }
      server.use(routes[name])
      const { user } = renderWithProviders(<Probe />, { queryClient: mutationToastQueryClient() })
      await screen.findByText('Công ty ABC')

      await user.click(screen.getByRole('button', { name }))

      await waitFor(() => expect(toast.success).not.toHaveBeenCalled())
      expect(toast.error).not.toHaveBeenCalled()
    },
  )
})

function DetailProbe() {
  const detail = useSupplier('s-1')
  return <output data-testid="detail">{detail.data?.name ?? detail.status}</output>
}

describe('useSupplier', () => {
  it('tải chi tiết theo slug', async () => {
    server.use(mswHttp.get(`${BASE}/suppliers/s-1`, () => ok(supplier)))
    renderWithProviders(<DetailProbe />)

    expect(await screen.findByText(supplier.name)).toBeInTheDocument()
  })

  it('lỗi 404 → không toast global: query mang meta.suppressErrorToast', async () => {
    server.use(mswHttp.get(`${BASE}/suppliers/s-1`, () => apiError(404, 101201)))
    const { queryClient } = renderWithProviders(<DetailProbe />)

    await waitFor(() => expect(screen.getByTestId('detail')).toHaveTextContent('error'))
    expect(
      queryClient.getQueryCache().find({ queryKey: supplierKeys.detail('s-1') })?.meta,
    ).toEqual({ suppressErrorToast: true })
    expect(toast.error).not.toHaveBeenCalled()
  })
})

const createdAt = 'Thu Oct 08 2026 09:00:00 GMT+0700'
const supplierMaterial = {
  slug: 'm-1',
  createdAt,
  updatedAt: createdAt,
  code: 'VT-01',
  name: 'Xi măng',
}
const transaction = {
  slug: 't-1',
  createdAt,
  updatedAt: createdAt,
  type: 'PAYMENT' as const,
  amount: 500000,
  transactionDate: '2026-10-08T05:00:00.000Z',
}

function MaterialsProbe() {
  const page = useSupplierMaterials('s-1', { page: 1, size: 10 })
  const all = useAllSupplierMaterials('s-1')
  const attach = useAttachSupplierMaterial()
  const detach = useDetachSupplierMaterial()
  const txs = useSupplierTransactions('s-1', { page: 1, size: 10, type: 'PAYMENT' })
  const create = useCreateSupplierTransaction()

  return (
    <div>
      <output data-testid="page">{(page.data?.items ?? []).map((m) => m.name).join(',')}</output>
      <output data-testid="all">{all.data?.items.length ?? 'none'}</output>
      <output data-testid="txs">{(txs.data?.items ?? []).map((x) => x.amount).join(',')}</output>
      <output data-testid="attach-status">{attach.status}</output>
      <output data-testid="tx-status">{create.status}</output>
      <button onClick={() => attach.mutate({ slug: 's-1', materialSlugs: ['m-1'] })}>attach</button>
      <button onClick={() => detach.mutate({ slug: 's-1', materialSlugs: ['m-1'] })}>detach</button>
      <button onClick={() => create.mutate({ slug: 's-1', input: { type: 'PAYMENT', amount: 1 } })}>
        tx
      </button>
    </div>
  )
}

describe('vật tư và giao dịch của nhà cung cấp', () => {
  beforeEach(() => {
    server.use(
      mswHttp.get(`${BASE}/suppliers/s-1/materials`, () => paginated([supplierMaterial])),
      mswHttp.get(`${BASE}/suppliers/s-1/transactions`, () => paginated([transaction])),
    )
  })

  it('tải vật tư/giao dịch, ghi cache theo [tiền tố, params]', async () => {
    const { queryClient } = renderWithProviders(<MaterialsProbe />)

    expect(await screen.findByText('Xi măng')).toBeInTheDocument()
    expect(await screen.findByText('500000')).toBeInTheDocument()
    expect(
      queryClient.getQueryData([...supplierKeys.materials('s-1'), { page: 1, size: 10 }]),
    ).toBeDefined()
    expect(
      queryClient.getQueryData([
        ...supplierKeys.transactions('s-1'),
        { page: 1, size: 10, type: 'PAYMENT' },
      ]),
    ).toBeDefined()
  })

  it('useAllSupplierMaterials tải page 1 size 100', async () => {
    let query = ''
    server.use(
      mswHttp.get(`${BASE}/suppliers/s-1/materials`, ({ request }) => {
        const params = new URL(request.url).searchParams
        if (params.get('size') === '100') query = params.toString()
        return paginated([supplierMaterial])
      }),
    )
    renderWithProviders(<MaterialsProbe />)

    await waitFor(() => expect(screen.getByTestId('all')).toHaveTextContent('1'))
    expect(query).toBe(new URLSearchParams({ page: '1', size: '100' }).toString())
  })

  it('attach thành công: toast và làm mới supplierKeys.materials', async () => {
    server.use(mswHttp.put(`${BASE}/suppliers/s-1/materials`, () => ok([supplierMaterial])))
    const { user, queryClient } = renderWithProviders(<MaterialsProbe />)
    await screen.findByText('Xi măng')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'attach' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã gắn 1 vật tư'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.materials('s-1') })
  })

  it('detach thành công: toast và làm mới supplierKeys.materials', async () => {
    server.use(mswHttp.delete(`${BASE}/suppliers/s-1/materials`, () => ok('detached')))
    const { user, queryClient } = renderWithProviders(<MaterialsProbe />)
    await screen.findByText('Xi măng')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'detach' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã gỡ 1 vật tư'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.materials('s-1') })
  })

  it('tạo giao dịch thành công: toast và làm mới supplierKeys.transactions', async () => {
    server.use(mswHttp.post(`${BASE}/suppliers/s-1/transactions`, () => ok(transaction)))
    const { user, queryClient } = renderWithProviders(<MaterialsProbe />)
    await screen.findByText('500000')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'tx' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã ghi giao dịch'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: supplierKeys.transactions('s-1') })
  })

  it.each(['attach', 'tx'] as const)(
    '%s lỗi: KHÔNG tự toast (suppressErrorToast)',
    async (name) => {
      server.use(
        mswHttp.put(`${BASE}/suppliers/s-1/materials`, () => apiError(422, 101200)),
        mswHttp.post(`${BASE}/suppliers/s-1/transactions`, () => apiError(422, 101220)),
      )
      const { user } = renderWithProviders(<MaterialsProbe />, {
        queryClient: mutationToastQueryClient(),
      })
      await screen.findByText('Xi măng')

      await user.click(screen.getByRole('button', { name }))

      await waitFor(() =>
        expect(
          screen.getByTestId(name === 'attach' ? 'attach-status' : 'tx-status'),
        ).toHaveTextContent('error'),
      )
      expect(toast.success).not.toHaveBeenCalled()
      expect(toast.error).not.toHaveBeenCalled()
    },
  )
})
