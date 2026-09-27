import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { ForbiddenPage } from './ForbiddenPage'

describe('ForbiddenPage', () => {
  it('mặc định → câu chung', () => {
    renderWithProviders(<ForbiddenPage />, { route: '/forbidden' })

    expect(screen.getByText('Không đủ quyền')).toBeInTheDocument()
  })

  it('?reason=permissionChanged → nói rõ là quyền VỪA đổi', () => {
    renderWithProviders(<ForbiddenPage />, { route: '/forbidden?reason=permissionChanged' })

    expect(screen.getByText('Quyền truy cập đã thay đổi')).toBeInTheDocument()
    expect(screen.getByText(/Quản trị viên vừa thay đổi quyền của vai trò bạn/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/')
  })

  it('reason lạ trên URL → câu chung, không vỡ', () => {
    renderWithProviders(<ForbiddenPage />, { route: '/forbidden?reason=xyz' })

    expect(screen.getByText('Không đủ quyền')).toBeInTheDocument()
  })
})
