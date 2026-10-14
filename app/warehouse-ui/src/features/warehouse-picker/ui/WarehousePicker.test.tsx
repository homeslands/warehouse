import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Warehouse } from '@/entities/warehouse'
import { renderWithProviders } from '@/shared/test/render'
import { FilterDisplayProvider } from '@/shared/ui/data-table/filter-display'
import { chooseOption, selectedLabel } from '@/shared/test/select'
import { WarehousePicker } from './WarehousePicker'

const w = (slug: string, code: string, name: string, isActive = true) =>
  ({ slug, code, name, isActive }) as Warehouse

describe('WarehousePicker', () => {
  it('hiện kho đang chọn, chọn kho khác gọi onChange; kho ngừng hoạt động có nhãn', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <WarehousePicker
        warehouses={[w('w-a', 'KHO-A', 'Kho A'), w('w-b', 'KHO-B', 'Kho B', false)]}
        value="w-a"
        onChange={onChange}
      />,
    )
    expect(selectedLabel('Kho')).toContain('KHO-A · Kho A')
    await chooseOption(user, 'Kho', 'KHO-B · Kho B (ngừng hoạt động)')
    expect(onChange).toHaveBeenCalledWith('w-b')
  })

  it('trên thanh lọc: có title tên đầy đủ để đọc khi bị cắt', () => {
    renderWithProviders(
      <WarehousePicker warehouses={[w('w-a', 'KHO-A', 'Kho A')]} value="w-a" onChange={vi.fn()} />,
    )
    expect(screen.getByRole('combobox', { name: 'Kho' })).toHaveAttribute('title', 'KHO-A · Kho A')
  })

  it('dạng chip (mobile): luôn ở trạng thái đang chọn, không có nút ✕ bỏ lọc', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <FilterDisplayProvider value="chip">
        <WarehousePicker
          warehouses={[w('w-a', 'KHO-A', 'Kho A'), w('w-b', 'KHO-B', 'Kho B')]}
          value="w-a"
          onChange={onChange}
        />
      </FilterDisplayProvider>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Kho' })
    expect(trigger).toHaveTextContent('KHO-A · Kho A')
    expect(trigger.closest('[data-active]')).toHaveAttribute('data-active', 'true')
    expect(screen.queryByRole('button', { name: /Bỏ lọc|Xoá/ })).not.toBeInTheDocument()
    await chooseOption(user, 'Kho', 'KHO-B · Kho B')
    expect(onChange).toHaveBeenCalledWith('w-b')
  })
})
