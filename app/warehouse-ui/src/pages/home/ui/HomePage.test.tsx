import { screen, within } from '@testing-library/react'
import { Boxes, FlaskConical, Package } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import type { NavGroup } from '@/shared/lib/nav'
import { renderWithProviders } from '@/shared/test/render'
import { HomePage } from './HomePage'

const nav: NavGroup[] = [
  {
    key: 'catalog',
    labelKey: 'nav:groups.catalog',
    items: [
      { to: '/materials', labelKey: 'nav:home', icon: Package },
      { to: '/warehouses', labelKey: 'nav:examples', icon: Boxes },
    ],
  },
  {
    key: 'dev',
    labelKey: 'nav:groups.dev',
    items: [{ to: '/examples', labelKey: 'nav:examples', icon: FlaskConical }],
  },
]

describe('HomePage', () => {
  it('chào kèm tên người dùng', () => {
    renderWithProviders(<HomePage nav={nav} />, { auth: 'admin' })
    expect(screen.getByRole('heading', { level: 1, name: 'Xin chào, root!' })).toBeInTheDocument()
  })

  it('chưa có user → lời chào chung, không có "Xin chào, !"', () => {
    renderWithProviders(<HomePage nav={[]} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Xin chào!' })).toBeInTheDocument()
    expect(screen.queryByText('Xin chào, !')).not.toBeInTheDocument()
  })

  it('mỗi nhóm một khối có tiêu đề; mỗi mục một thẻ lối tắt tới đúng đường dẫn', () => {
    renderWithProviders(<HomePage nav={nav} />, { auth: 'admin' })

    const catalog = screen.getByRole('region', { name: 'Danh mục' })
    expect(
      within(catalog)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/materials', '/warehouses'])
    const dev = screen.getByRole('region', { name: 'Dev' })
    expect(within(dev).getByRole('link', { name: 'Example' })).toHaveAttribute('href', '/examples')
    expect(screen.queryByText('Chưa có chức năng nào được cấp quyền.')).not.toBeInTheDocument()
  })

  it('không có mục nào → câu "Chưa có chức năng nào được cấp quyền."', () => {
    renderWithProviders(<HomePage nav={[]} />, { auth: 'customer' })
    expect(screen.getByText('Chưa có chức năng nào được cấp quyền.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
