import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FilterDisplayProvider } from './filter-display'
import { FilterField } from './FilterField'

describe('FilterField', () => {
  it('popover: vẽ nhãn phía trên ô, nhãn gắn với control', () => {
    render(
      <FilterDisplayProvider value="popover">
        <FilterField label="Người tạo">
          <input />
        </FilterField>
      </FilterDisplayProvider>,
    )
    expect(screen.getByText('Người tạo')).toBeInTheDocument()
    expect(screen.getByLabelText('Người tạo')).toBeInTheDocument()
  })

  it('popover + group: nhóm có tên theo nhãn', () => {
    render(
      <FilterDisplayProvider value="popover">
        <FilterField label="Khoảng" group>
          <button type="button">a</button>
          <button type="button">b</button>
        </FilterField>
      </FilterDisplayProvider>,
    )
    expect(screen.getByRole('group', { name: 'Khoảng' })).toBeInTheDocument()
  })

  it.each(['inline', 'chip'] as const)('%s: chỉ trả children, không nhãn', (mode) => {
    render(
      <FilterDisplayProvider value={mode}>
        <FilterField label="Người tạo">
          <input aria-label="x" />
        </FilterField>
      </FilterDisplayProvider>,
    )
    expect(screen.queryByText('Người tạo')).not.toBeInTheDocument()
    expect(screen.getByLabelText('x')).toBeInTheDocument()
  })
})
