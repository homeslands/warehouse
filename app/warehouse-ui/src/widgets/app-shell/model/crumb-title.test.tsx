import { act, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { Link, Outlet, RouterProvider, createMemoryRouter, useParams } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import i18n from '@/shared/i18n'
import { useCrumbTitle } from './crumb-title'
import { useCrumbs, useDocumentTitle } from './crumbs'

function Layout() {
  const crumbs = useCrumbs()
  useDocumentTitle()
  return (
    <>
      <output data-testid="crumbs">{crumbs.map((c) => c.label).join(' › ')}</output>
      <Outlet />
    </>
  )
}

const NAMES: Record<string, string | undefined> = { a: 'Kho A', b: 'Kho B', loading: undefined }

function Detail() {
  const { slug = '' } = useParams()
  useCrumbTitle(NAMES[slug])
  return (
    <>
      <Link to="/warehouses/b">sang B</Link>
      <Link to="/warehouses">về danh sách</Link>
    </>
  )
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [
          {
            path: '/warehouses',
            handle: { crumb: 'nav:warehouses' },
            children: [
              { index: true, element: <p>DANH SÁCH</p> },
              { path: ':slug', handle: { crumb: 'nav:detail' }, element: <Detail /> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  )
  return router
}

const crumbs = () => screen.getByTestId('crumbs').textContent

describe('useCrumbTitle', () => {
  it('thay nhãn mục cuối và tiêu đề tab bằng tên bản ghi', () => {
    renderAt('/warehouses/a')

    expect(crumbs()).toBe('Tổng quan › Kho › Kho A')
    expect(document.title).toBe('Kho A · Warehouse')
  })

  it('chưa có tên (đang tải) → nhãn tĩnh "Chi tiết"', () => {
    renderAt('/warehouses/loading')

    expect(crumbs()).toBe('Tổng quan › Kho › Chi tiết')
  })

  it('sang bản ghi khác KHÔNG hiện tên bản ghi cũ', async () => {
    const router = renderAt('/warehouses/a')

    await act(() => router.navigate('/warehouses/b'))

    expect(crumbs()).toBe('Tổng quan › Kho › Kho B')
    expect(document.title).toBe('Kho B · Warehouse')
  })

  it('rời trang chi tiết → nhãn và tiêu đề trả về như cũ', async () => {
    const router = renderAt('/warehouses/a')

    await act(() => router.navigate('/warehouses'))

    expect(crumbs()).toBe('Tổng quan › Kho')
    expect(document.title).toBe('Kho · Warehouse')
  })
})
