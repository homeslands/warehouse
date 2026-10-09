import { screen, waitFor } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// supplierSearch / supplierSort mặc định TẮT (sandbox chưa có bản backend mới). File này bật cả hai để
// phần "dựng sẵn" thật sự được chạy — không thì code sau cờ hỏng âm thầm tới ngày bật.
vi.mock('@/shared/api/backend-capabilities', () => ({
  BACKEND_SUPPORTS: { supplierSearch: true, supplierSort: true, supplierTransactions: false },
}))

import type { Supplier } from '@/entities/supplier'
import { paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { SuppliersPage } from './SuppliersPage'

const BASE = 'http://localhost:8085/api/v1'

const supplier: Supplier = {
  slug: 'ncc-abc',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  code: 'NCC-ABC',
  name: 'Công ty ABC',
  taxCode: '0101234567',
  phonenumber: '0912345678',
}

const ADMIN = { userName: 'a', roleName: 'ADMIN', scope: ['SUPPLIER_READ', 'MATERIAL_READ'] }

function LocationProbe() {
  return <output data-testid="location">{useLocation().search}</output>
}

/** Query đã decode của mọi lần GET /suppliers; `items` = dữ liệu trả về. */
function captureQuery(items: Supplier[] = [supplier]) {
  const seen: string[] = []
  server.use(
    mswHttp.get(`${BASE}/suppliers`, ({ request }) => {
      seen.push(decodeURIComponent(new URL(request.url).search))
      return paginated(items, { page: 1, size: 10, total: items.length })
    }),
  )
  return seen
}

function renderPage(route = '/suppliers') {
  return renderWithProviders(
    <>
      <SuppliersPage />
      <LocationProbe />
    </>,
    { route, auth: ADMIN },
  )
}

describe('SuppliersPage — sắp xếp (cờ supplierSort bật)', () => {
  it('bấm tiêu đề Mã số thuế → gửi sort[]=taxCode:ASC, ghi lên URL', async () => {
    const seen = captureQuery()
    const { user } = renderPage()
    await screen.findByText('Công ty ABC')

    await user.click(screen.getByRole('button', { name: 'Mã số thuế' }))

    await waitFor(() => expect(seen.at(-1)).toContain('sort[]=taxCode:ASC'))
    expect(screen.getByTestId('location')).toHaveTextContent('sort=taxCode%3AASC')
  })

  it('cột không khai sortField (Người liên hệ) không bấm được', async () => {
    captureQuery()
    renderPage()
    await screen.findByText('Công ty ABC')
    expect(screen.queryByRole('button', { name: 'Người liên hệ' })).not.toBeInTheDocument()
  })
})

describe('SuppliersPage — tìm (cờ supplierSearch bật)', () => {
  it.each([
    ['Công ty', 'search', 'Công ty'],
    ['ncc-hn-01', 'code', 'NCC-HN-01'],
    ['0101234567-001', 'taxCode', '0101234567-001'],
    ['0912 345 678', 'phonenumber', '0912345678'],
  ])('gõ "%s" → gửi %s=%s (không kèm tham số tìm khác)', async (typed, key, value) => {
    const seen = captureQuery()
    const { user } = renderPage()
    await screen.findByText('Công ty ABC')

    await user.type(screen.getByRole('searchbox'), typed)

    await waitFor(() => expect(new URLSearchParams(seen.at(-1)).get(key)).toBe(value))
    const sent = new URLSearchParams(seen.at(-1))
    const used = ['search', 'code', 'taxCode', 'phonenumber'].filter((k) => sent.has(k))
    expect(used).toEqual([key])
  })

  it('trống khi tìm theo tên → nói rõ đã tìm theo tên/liên hệ/email, không có nút đổi trường', async () => {
    captureQuery([])
    renderPage('/suppliers?search=xyz')

    expect(
      await screen.findByText(
        'Không có nhà cung cấp nào có tên, người liên hệ hoặc email chứa “xyz”.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tìm theo/ })).not.toBeInTheDocument()
  })

  it('10 chữ số đoán là SĐT mà trống → nút "Tìm theo mã số thuế" gửi lại bằng taxCode (MST TP.HCM 03…)', async () => {
    const seen = captureQuery([])
    const { user } = renderPage('/suppliers?search=0301234567')

    expect(
      await screen.findByText(/Không có nhà cung cấp nào có số điện thoại chứa “0301234567”/),
    ).toBeInTheDocument()
    expect(seen.at(-1)).toContain('phonenumber=0301234567')

    await user.click(screen.getByRole('button', { name: 'Tìm theo mã số thuế' }))

    await waitFor(() => expect(seen.at(-1)).toContain('taxCode=0301234567'))
    expect(seen.at(-1)).not.toContain('phonenumber=')
    expect(screen.getByTestId('location')).toHaveTextContent('searchBy=taxCode')
    expect(
      await screen.findByRole('button', { name: 'Tìm theo số điện thoại' }),
    ).toBeInTheDocument()
  })

  it('gõ lại ô tìm → bỏ lựa chọn searchBy cũ, đoán lại từ đầu', async () => {
    const seen = captureQuery()
    const { user } = renderPage('/suppliers?search=0301234567&searchBy=taxCode')
    await screen.findByText('Công ty ABC')
    expect(seen.at(-1)).toContain('taxCode=0301234567')

    const box = screen.getByRole('searchbox')
    await user.clear(box)
    await user.type(box, '0912345678')

    await waitFor(() => expect(seen.at(-1)).toContain('phonenumber=0912345678'))
    expect(screen.getByTestId('location')).not.toHaveTextContent('searchBy')
  })
})
