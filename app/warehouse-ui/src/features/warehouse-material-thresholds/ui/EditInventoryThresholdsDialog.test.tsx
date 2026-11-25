import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

import { toast } from 'sonner'
import { importFormKeys } from '@/entities/import-form'
import { inventoryKeys } from '@/entities/inventory'
import { apiError, ok } from '@/shared/test/api'
import { confirmStep } from '@/shared/test/confirm'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { type ThresholdTarget } from '../model/thresholds'
import { EditInventoryThresholdsDialog } from './EditInventoryThresholdsDialog'

const BASE = 'http://localhost:8085/api/v1'

const makeItem = (over: Partial<ThresholdTarget> = {}): ThresholdTarget => ({
  materialSlug: 'm-1',
  materialCode: 'VT-01',
  materialName: 'Đường cát',
  minimumInventory: 10,
  maximumInventory: 100,
  effectiveMinimumInventory: 10,
  effectiveMaximumInventory: 100,
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  ...over,
})

const makeMaterial = (over: Record<string, unknown> = {}) => ({
  slug: 'm-1',
  createdAt: '',
  updatedAt: '',
  code: 'VT-01',
  name: 'Đường cát',
  minimumInventory: 5,
  maximumInventory: 500,
  type: { slug: 'mt-1', code: 'NL', name: 'Nguyên liệu' },
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  hasSupplier: false,
  suppliers: [],
  warehouses: [],
  units: [],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  server.use(mswHttp.get(`${BASE}/materials/m-1`, () => ok(makeMaterial())))
})

describe('EditInventoryThresholdsDialog', () => {
  it('nạp sẵn ngưỡng riêng; khoá nút Lưu khi chưa đổi; sửa rồi xác nhận → PATCH chỉ trường đã đổi', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invSpy = vi.spyOn(qc, 'invalidateQueries')
    let sentBody: unknown
    server.use(
      mswHttp.patch(`${BASE}/warehouses/w-a/materials/m-1`, async ({ request }) => {
        sentBody = await request.json()
        return ok({ ...makeItem(), maximumInventory: 200, effectiveMaximumInventory: 200 })
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <EditInventoryThresholdsDialog
        warehouseSlug="w-a"
        item={makeItem()}
        onOpenChange={onOpenChange}
      />,
      { auth: 'admin', queryClient: qc },
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('VT-01 · Đường cát (KG)')).toBeInTheDocument()
    const minInput = within(dialog).getByLabelText('Tồn tối thiểu')
    const maxInput = within(dialog).getByLabelText('Tồn tối đa')
    expect(minInput).toHaveValue('10')
    expect(maxInput).toHaveValue('100')

    const saveBtn = within(dialog).getByRole('button', { name: 'Lưu' })
    expect(saveBtn).toBeDisabled()

    await user.clear(maxInput)
    await user.type(maxInput, '200')
    expect(saveBtn).toBeEnabled()

    await user.click(saveBtn)
    expect(screen.getByText('100 → 200')).toBeInTheDocument()
    await confirmStep(user, 'Lưu thay đổi')

    await waitFor(() => expect(sentBody).toEqual({ maximumInventory: 200 }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(toast.success).toHaveBeenCalledWith('Đã cập nhật ngưỡng tồn cho VT-01 · Đường cát')
    expect(invSpy).toHaveBeenCalledWith({ queryKey: inventoryKeys.warehouse('w-a') })
    expect(invSpy).toHaveBeenCalledWith({ queryKey: importFormKeys.available('w-a') })
  })

  it('bấm "Dùng mặc định" trên ô đang có ngưỡng riêng → hiện đúng giá trị mặc định và gửi null', async () => {
    let sentBody: unknown
    server.use(
      mswHttp.patch(`${BASE}/warehouses/w-a/materials/m-1`, async ({ request }) => {
        sentBody = await request.json()
        return ok({ ...makeItem(), minimumInventory: null })
      }),
    )
    const { user } = renderWithProviders(
      <EditInventoryThresholdsDialog
        warehouseSlug="w-a"
        item={makeItem()}
        onOpenChange={vi.fn()}
      />,
      { auth: 'admin' },
    )

    const useDefaultBtns = await screen.findAllByRole('button', { name: 'Dùng mặc định' })
    await user.click(useDefaultBtns[0])
    expect(await screen.findByText('Mặc định: 5')).toBeInTheDocument()
    expect(screen.getByLabelText('Tồn tối thiểu')).toHaveAttribute('placeholder', '5')

    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(screen.getByText('10 → Mặc định (5)')).toBeInTheDocument()
    await confirmStep(user, 'Lưu thay đổi')

    await waitFor(() => expect(sentBody).toEqual({ minimumInventory: null }))
  })

  it('bấm "Dùng mặc định" khi mặc định vật tư tối đa = 0 → hiện "Mặc định: Không giới hạn"', async () => {
    server.use(
      mswHttp.get(`${BASE}/materials/m-1`, () =>
        ok(makeMaterial({ minimumInventory: 0, maximumInventory: 0 })),
      ),
    )
    const { user } = renderWithProviders(
      <EditInventoryThresholdsDialog
        warehouseSlug="w-a"
        item={makeItem()}
        onOpenChange={vi.fn()}
      />,
      { auth: 'admin' },
    )

    const useDefaultBtns = await screen.findAllByRole('button', { name: 'Dùng mặc định' })
    await user.click(useDefaultBtns[1])
    expect(await screen.findByText('Mặc định: Không giới hạn')).toBeInTheDocument()
    expect(screen.getByLabelText('Tồn tối đa')).toHaveAttribute('placeholder', 'Không giới hạn')
  })

  it('nhập 0 cho tồn tối đa (không giới hạn) vẫn gửi được dù tồn tối thiểu > 0', async () => {
    let sentBody: unknown
    server.use(
      mswHttp.patch(`${BASE}/warehouses/w-a/materials/m-1`, async ({ request }) => {
        sentBody = await request.json()
        return ok({ ...makeItem(), maximumInventory: 0, effectiveMaximumInventory: 0 })
      }),
    )
    const { user } = renderWithProviders(
      <EditInventoryThresholdsDialog
        warehouseSlug="w-a"
        item={makeItem()}
        onOpenChange={vi.fn()}
      />,
      { auth: 'admin' },
    )

    const maxInput = await screen.findByLabelText('Tồn tối đa')
    await user.clear(maxInput)
    await user.type(maxInput, '0')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmStep(user, 'Lưu thay đổi')

    await waitFor(() => expect(sentBody).toEqual({ maximumInventory: 0 }))
  })

  it('lỗi validate client (max > 0 và max < min) → không sang bước xác nhận, hiện lỗi tại ô', async () => {
    const { user } = renderWithProviders(
      <EditInventoryThresholdsDialog
        warehouseSlug="w-a"
        item={makeItem()}
        onOpenChange={vi.fn()}
      />,
      { auth: 'admin' },
    )

    const maxInput = await screen.findByLabelText('Tồn tối đa')
    await user.clear(maxInput)
    await user.type(maxInput, '5')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(screen.queryByText('Lưu thay đổi ngưỡng tồn?')).not.toBeInTheDocument()
    expect(screen.getByText('Tồn tối đa phải lớn hơn hoặc bằng tồn tối thiểu')).toBeInTheDocument()
    expect(maxInput).toHaveAttribute('aria-invalid', 'true')
  })

  it('BE trả 100811 → quay về màn nhập, hiện lỗi dưới ô tương ứng và focus vào ô đó', async () => {
    server.use(mswHttp.patch(`${BASE}/warehouses/w-a/materials/m-1`, () => apiError(422, 100811)))
    const { user } = renderWithProviders(
      <EditInventoryThresholdsDialog
        warehouseSlug="w-a"
        item={makeItem({ minimumInventory: 50, maximumInventory: 100 })}
        onOpenChange={vi.fn()}
      />,
      { auth: 'admin' },
    )

    // Mặc định phía FE còn cũ (500), nhưng BE vừa đổi mặc định thấp hơn 50 → BE trả 100811.
    const useDefaultBtns = await screen.findAllByRole('button', { name: 'Dùng mặc định' })
    await user.click(useDefaultBtns[1])
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmStep(user, 'Lưu thay đổi')

    expect(
      await screen.findByText('Tồn tối đa phải lớn hơn hoặc bằng tồn tối thiểu'),
    ).toBeInTheDocument()
    const maxInput = screen.getByLabelText('Tồn tối đa')
    expect(maxInput).toHaveAttribute('aria-invalid', 'true')
    expect(maxInput).toHaveFocus()
  })

  it('xoá trắng ô đang có ngưỡng riêng → báo lỗi nhập số, không gửi null về mặc định', async () => {
    const patchHit = vi.fn()
    server.use(
      mswHttp.patch(`${BASE}/warehouses/w-a/materials/m-1`, () => {
        patchHit()
        return ok(makeItem())
      }),
    )
    const { user } = renderWithProviders(
      <EditInventoryThresholdsDialog
        warehouseSlug="w-a"
        item={makeItem()}
        onOpenChange={vi.fn()}
      />,
      { auth: 'admin' },
    )

    const maxInput = await screen.findByLabelText('Tồn tối đa')
    await user.clear(maxInput)
    expect(screen.queryByText('Đang theo mặc định của vật tư')).not.toBeInTheDocument()

    const saveBtn = screen.getByRole('button', { name: 'Lưu' })
    expect(saveBtn).toBeEnabled()
    await user.click(saveBtn)

    expect(screen.queryByText('Lưu thay đổi ngưỡng tồn?')).not.toBeInTheDocument()
    expect(screen.getByText('Nhập số ≥ 0, tối đa 6 chữ số thập phân')).toBeInTheDocument()
    expect(maxInput).toHaveAttribute('aria-invalid', 'true')
    expect(maxInput).toHaveFocus()
    expect(patchHit).not.toHaveBeenCalled()
  })

  it('tải mặc định vật tư đang chờ và lỗi → hiện trạng thái rõ ràng và cho phép thử lại', async () => {
    let attempts = 0
    let resolvePending: (() => void) | undefined
    server.use(
      mswHttp.get(`${BASE}/materials/m-1`, async () => {
        attempts += 1
        if (attempts === 1) {
          await new Promise<void>((resolve) => {
            resolvePending = resolve
          })
          return apiError(500)
        }
        return ok(makeMaterial())
      }),
    )
    const { user } = renderWithProviders(
      <EditInventoryThresholdsDialog
        warehouseSlug="w-a"
        item={makeItem()}
        onOpenChange={vi.fn()}
      />,
      { auth: 'admin' },
    )

    const useDefaultBtns = await screen.findAllByRole('button', { name: 'Dùng mặc định' })
    await user.click(useDefaultBtns[0])
    expect(screen.getByText('Đang tải mặc định…')).toBeInTheDocument()

    resolvePending?.()
    expect(await screen.findByText('Không tải được mặc định')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Mặc định: 5')).toBeInTheDocument()
  })

  it('BE trả 100801 → đóng hộp, báo info toast và gọi onNotFound', async () => {
    server.use(mswHttp.patch(`${BASE}/warehouses/w-a/materials/m-1`, () => apiError(404, 100801)))
    const onOpenChange = vi.fn()
    const onNotFound = vi.fn()
    const { user } = renderWithProviders(
      <EditInventoryThresholdsDialog
        warehouseSlug="w-a"
        item={makeItem()}
        onOpenChange={onOpenChange}
        onNotFound={onNotFound}
      />,
      { auth: 'admin' },
    )

    const minInput = await screen.findByLabelText('Tồn tối thiểu')
    await user.clear(minInput)
    await user.type(minInput, '15')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmStep(user, 'Lưu thay đổi')

    await waitFor(() => expect(onNotFound).toHaveBeenCalledWith('m-1'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(toast.info).toHaveBeenCalledWith('VT-01 · Đường cát đã được gỡ khỏi kho trước đó')
  })

  it('BE trả 500 → toast lỗi và vẫn giữ bước xác nhận', async () => {
    server.use(mswHttp.patch(`${BASE}/warehouses/w-a/materials/m-1`, () => apiError(500)))
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <EditInventoryThresholdsDialog
        warehouseSlug="w-a"
        item={makeItem()}
        onOpenChange={onOpenChange}
      />,
      { auth: 'admin' },
    )

    const minInput = await screen.findByLabelText('Tồn tối thiểu')
    await user.clear(minInput)
    await user.type(minInput, '15')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))
    await confirmStep(user, 'Lưu thay đổi')

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByText('Lưu thay đổi ngưỡng tồn?')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
