import { describe, expect, it, vi } from 'vitest'
import type { Warehouse } from '@/entities/warehouse'
import { renderWithProviders } from '@/shared/test/render'
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
})
