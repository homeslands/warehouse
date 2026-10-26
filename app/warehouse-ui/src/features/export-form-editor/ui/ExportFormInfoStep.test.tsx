import { zodResolver } from '@hookform/resolvers/zod'
import { screen, waitFor, within } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { Warehouse } from '@/entities/warehouse'
import { Form } from '@/shared/ui/form'
import { server } from '@/shared/test/msw'
import { ok, paginated } from '@/shared/test/api'
import { renderWithProviders } from '@/shared/test/render'
import { ExportFormInfoStep } from './ExportFormInfoStep'
import {
  buildExportFormSchema,
  emptyExportFormValues,
  type ExportFormValues,
} from '../model/export-form-editor.schema'

const BASE = 'http://localhost:8085/api/v1'

const warehouse = (slug: string, code: string, name: string, isActive = true): Warehouse => ({
  slug,
  code,
  name,
  isActive,
  address: '',
  createdAt: '',
  updatedAt: '',
})
const WAREHOUSES = [
  warehouse('w-a', 'KHO-A', 'Kho A'),
  warehouse('w-b', 'KHO-B', 'Kho B'),
  warehouse('w-c', 'KHO-C', 'Kho C (ngừng)', false),
]

let current: ExportFormValues | undefined
let onTypeChange: (next: string, prev: string | undefined) => boolean

function Harness({
  defaults = {},
  canReadWarehouses = true,
}: {
  defaults?: Partial<ExportFormValues>
  canReadWarehouses?: boolean
}) {
  const form = useForm<ExportFormValues>({
    resolver: zodResolver(buildExportFormSchema({ sale: false })),
    mode: 'onTouched',
    defaultValues: { ...emptyExportFormValues(new Date(2026, 9, 26, 8, 5)), ...defaults },
  })
  current = form.watch()
  return (
    <Form {...form}>
      <ExportFormInfoStep
        form={form}
        warehouseSlug="w-a"
        canReadWarehouses={canReadWarehouses}
        onUploadingChange={vi.fn()}
        onTypeChange={(next, prev) => onTypeChange(next, prev)}
      />
      <button type="button" onClick={() => void form.handleSubmit(() => undefined)()}>
        Tiếp tục
      </button>
    </Form>
  )
}

function mockWarehouses() {
  const hit = vi.fn()
  server.use(
    mswHttp.get(`${BASE}/warehouses`, () => {
      hit()
      return paginated(WAREHOUSES)
    }),
  )
  return hit
}

describe('ExportFormInfoStep', () => {
  it('Tiếp tục khi trống → lỗi Lý do / Người nhận / Số PO', async () => {
    onTypeChange = () => true
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    expect(await screen.findByText('Chọn lý do xuất')).toBeInTheDocument()
    expect(screen.getByText('Nhập người nhận')).toBeInTheDocument()
    expect(screen.getByText('Nhập số PO')).toBeInTheDocument()
  })

  it('Lý do xuất: nhóm radio 5 nút theo thứ tự, bấm chọn', async () => {
    onTypeChange = () => true
    const { user } = renderWithProviders(<Harness />)
    const group = screen.getByRole('radiogroup', { name: /Lý do xuất/ })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual([
      'Sản xuất',
      'Xuất huỷ',
      'Chuyển kho',
      'Bán',
      'Khác',
    ])
    expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    await user.click(radios[3])
    expect(current?.type).toBe('SALE')
    expect(radios[3]).toHaveAttribute('aria-checked', 'true')
  })

  it('phím mũi tên đổi lựa chọn (roving tabindex)', async () => {
    onTypeChange = () => true
    const { user } = renderWithProviders(<Harness defaults={{ type: 'PRODUCTION' }} />)
    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toHaveAttribute('tabindex', '0')
    expect(radios[1]).toHaveAttribute('tabindex', '-1')
    radios[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(current?.type).toBe('DISPOSAL')
    expect(screen.getAllByRole('radio')[1]).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(current?.type).toBe('OTHER')
  })

  it('onTypeChange trả false → giữ lý do cũ', async () => {
    onTypeChange = vi.fn(() => false)
    const { user } = renderWithProviders(<Harness defaults={{ type: 'SALE' }} />)
    await user.click(screen.getByRole('radio', { name: 'Khác' }))
    expect(onTypeChange).toHaveBeenCalledWith('OTHER', 'SALE')
    expect(current?.type).toBe('SALE')
  })

  it('Chuyển kho (có quyền) → ô chọn kho, không có kho hiện tại / kho ngừng; chọn kho → receiver', async () => {
    onTypeChange = () => true
    mockWarehouses()
    const { user } = renderWithProviders(<Harness defaults={{ type: 'TRANSFER' }} />)
    await user.click(await screen.findByRole('combobox', { name: /Kho nhận/ }))
    expect(await screen.findByRole('option', { name: 'Kho: KHO-B · Kho B' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /KHO-A/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /KHO-C/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Kho: KHO-B · Kho B' }))
    expect(current?.receiver).toBe('Kho: KHO-B · Kho B')
  })

  it('"Kho khác — nhập tên" → ô chữ', async () => {
    onTypeChange = () => true
    mockWarehouses()
    const { user } = renderWithProviders(<Harness defaults={{ type: 'TRANSFER' }} />)
    await user.click(await screen.findByRole('combobox', { name: /Kho nhận/ }))
    await user.click(await screen.findByRole('button', { name: 'Kho khác — nhập tên' }))
    const input = await screen.findByRole('textbox', { name: /Kho nhận/ })
    await user.type(input, 'Kho ngoài')
    expect(current?.receiver).toBe('Kho ngoài')
  })

  it('mở nháp: receiver khớp kho → chọn sẵn; không khớp → ô chữ với chữ đã lưu', async () => {
    onTypeChange = () => true
    mockWarehouses()
    const first = renderWithProviders(
      <Harness defaults={{ type: 'TRANSFER', receiver: 'Kho: KHO-B · Kho B' }} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Kho nhận/ })).toHaveTextContent(
        'Kho: KHO-B · Kho B',
      ),
    )
    first.unmount()
    renderWithProviders(<Harness defaults={{ type: 'TRANSFER', receiver: 'Kho lạ' }} />)
    expect(await screen.findByRole('textbox', { name: /Kho nhận/ })).toHaveValue('Kho lạ')
  })

  it('nháp có người nhận chữ tự do: xoá trắng để gõ lại → vẫn là ô chữ, không đổi sang ô chọn kho', async () => {
    onTypeChange = () => true
    mockWarehouses()
    const { user } = renderWithProviders(
      <Harness defaults={{ type: 'TRANSFER', receiver: 'Kho lạ' }} />,
    )
    const input = await screen.findByRole('textbox', { name: /Kho nhận/ })
    await new Promise((r) => setTimeout(r, 50))
    await user.clear(input)
    expect(screen.getByRole('textbox', { name: /Kho nhận/ })).toBe(input)
    expect(screen.queryByRole('combobox', { name: /Kho nhận/ })).not.toBeInTheDocument()
    await user.type(input, 'Kho mới')
    expect(current?.receiver).toBe('Kho mới')
    expect(input).toHaveFocus()
  })

  it('thiếu WAREHOUSE_READ → ô chữ và không gọi GET /warehouses', async () => {
    onTypeChange = () => true
    const hit = mockWarehouses()
    const { user } = renderWithProviders(
      <Harness defaults={{ type: 'TRANSFER' }} canReadWarehouses={false} />,
    )
    await user.type(screen.getByRole('textbox', { name: /Người nhận/ }), 'Kho X')
    expect(current?.receiver).toBe('Kho X')
    await new Promise((r) => setTimeout(r, 50))
    expect(hit).not.toHaveBeenCalled()
  })

  it('lý do khác Chuyển kho → ô chữ và không gọi GET /warehouses', async () => {
    onTypeChange = () => true
    const hit = mockWarehouses()
    renderWithProviders(<Harness defaults={{ type: 'SALE' }} />)
    expect(screen.getByRole('textbox', { name: /Người nhận/ })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(hit).not.toHaveBeenCalled()
  })

  it('đổi lý do sang Chuyển kho → ô đổi thành chọn kho', async () => {
    onTypeChange = () => true
    mockWarehouses()
    const { user } = renderWithProviders(<Harness defaults={{ type: 'OTHER' }} />)
    await user.click(screen.getByRole('radio', { name: 'Chuyển kho' }))
    expect(await screen.findByRole('combobox', { name: /Kho nhận/ })).toBeInTheDocument()
  })

  it('upload chứng từ qua export-forms/upload-file → hiện tên dễ đọc, form giữ key', async () => {
    onTypeChange = () => true
    server.use(
      mswHttp.post(`${BASE}/warehouses/w-a/export-forms/upload-file`, () =>
        ok<string>('phieu-1760000000000.pdf'),
      ),
    )
    const { user } = renderWithProviders(<Harness />)
    await user.upload(screen.getByLabelText('Chứng từ đính kèm'), new File(['x'], 'phieu.pdf'))
    expect(await screen.findByText('phieu.pdf')).toBeInTheDocument()
    await waitFor(() => expect(current?.file).toBe('phieu-1760000000000.pdf'))
  })

  it('mã phiếu có gợi ý PX-…', () => {
    onTypeChange = () => true
    renderWithProviders(<Harness />)
    expect(screen.getByLabelText(/Mã phiếu/)).toHaveValue('PX-20261026-0805')
  })
})
