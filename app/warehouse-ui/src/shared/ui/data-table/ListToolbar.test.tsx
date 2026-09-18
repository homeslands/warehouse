import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ListToolbar } from './ListToolbar'

describe('ListToolbar', () => {
  it('hiện cả vùng bộ lọc và vùng hành động', () => {
    render(
      <ListToolbar
        filters={<input aria-label="Tìm kiếm" />}
        actions={<button type="button">Tạo</button>}
      />,
    )
    expect(screen.getByLabelText('Tìm kiếm')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeInTheDocument()
  })
})
