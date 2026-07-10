import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CenteredMessage } from '@/components/layout/CenteredMessage'

describe('CenteredMessage', () => {
  it('hiện tiêu đề, mô tả, và phần children', () => {
    render(
      <CenteredMessage title="Tiêu đề" description="Mô tả">
        <button type="button">Nút</button>
      </CenteredMessage>,
    )

    expect(screen.getByRole('heading', { name: 'Tiêu đề' })).toBeInTheDocument()
    expect(screen.getByText('Mô tả')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nút' })).toBeInTheDocument()
  })

  it('không có children thì vẫn render được', () => {
    render(<CenteredMessage title="Chỉ tiêu đề" description="Chỉ mô tả" />)

    expect(screen.getByRole('heading', { name: 'Chỉ tiêu đề' })).toBeInTheDocument()
  })
})
