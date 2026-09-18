import { act, screen, within } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import i18n from '@/shared/i18n'
import { apiError, ok, paginated } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { Example } from '@/entities/example'
import { ExamplesPage } from '@/pages/examples'

const BASE = 'http://localhost:8085/api/v1'

const example: Example = {
  id: '1',
  slug: 'example-a',
  name: 'Example A',
  description: 'mô tả',
  version: 3,
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
}
const exampleB: Example = { ...example, id: '2', slug: 'example-b', name: 'Example B' }

function LocationProbe() {
  const { search } = useLocation()
  return <output data-testid="location">{search}</output>
}

function renderPage(options: { route?: string; auth?: 'admin' | 'customer' } = {}) {
  return renderWithProviders(
    <>
      <ExamplesPage />
      <LocationProbe />
    </>,
    { route: options.route ?? '/examples', auth: options.auth ?? 'admin' },
  )
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  server.use(mswHttp.get(`${BASE}/examples`, () => paginated([example])))
})

describe('ExamplesPage — hiển thị và quyền', () => {
  it('hiện dữ liệu trả về từ API', async () => {
    renderPage()
    expect(await screen.findByText('Example A')).toBeInTheDocument()
  })

  it('SUPER_ADMIN thấy nút Tạo', async () => {
    renderPage()
    await screen.findByText('Example A')
    expect(screen.getByRole('button', { name: /tạo example/i })).toBeInTheDocument()
  })

  it('CUSTOMER KHÔNG thấy nút Tạo', async () => {
    renderPage({ auth: 'customer' })
    await screen.findByText('Example A')
    expect(screen.queryByRole('button', { name: /tạo example/i })).not.toBeInTheDocument()
  })

  it('khi API lỗi vẫn giữ tiêu đề và nút tạo, không bỏ rơi người dùng', async () => {
    server.use(
      mswHttp.get(`${BASE}/examples`, () => apiError(500, undefined, 'Internal server error')),
    )
    renderPage()

    // Thông báo lỗi phải hiện, dùng đúng message backend trả (không có `code` nên không bị dịch)...
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Internal server error')
    // ...nhưng khung màn hình không được biến mất cùng với nó.
    expect(screen.getByRole('heading')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tạo example/i })).toBeInTheDocument()
    // "Request thất bại" và "danh sách rỗng" là hai chuyện khác nhau — không hiện cả hai.
    expect(screen.queryByText('Chưa có dữ liệu.')).not.toBeInTheDocument()
  })

  it('đã có dữ liệu mà tải lại nền lỗi → KHÔNG hiện lỗi tại chỗ (toast global đã báo), giữ dữ liệu cũ', async () => {
    const { queryClient } = renderPage()
    await screen.findByText('Example A')

    server.use(
      mswHttp.get(`${BASE}/examples`, () =>
        HttpResponse.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries()
    })

    expect(queryClient.getQueryCache().getAll()[0]?.state.status).toBe('error')
    expect(screen.getByText('Example A')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('mô tả rỗng hiện "—", không để ô trống', async () => {
    server.use(mswHttp.get(`${BASE}/examples`, () => paginated([{ ...example, description: '' }])))
    renderPage()

    const row = (await screen.findByText('Example A')).closest('tr')!
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent(/^—$/)
  })

  it('cột Ngày tạo theo ngôn ngữ đang chọn, đổi ngôn ngữ thì đổi định dạng', async () => {
    // Giờ địa phương → kết quả không phụ thuộc múi giờ máy chạy test.
    const createdAt = new Date(2026, 6, 9, 14, 30).toISOString()
    server.use(mswHttp.get(`${BASE}/examples`, () => paginated([{ ...example, createdAt }])))
    renderPage()

    expect(await screen.findByText('09/07/2026 14:30')).toBeInTheDocument()
    try {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
      expect(await screen.findByText('07/09/2026 14:30')).toBeInTheDocument()
    } finally {
      await act(async () => {
        await i18n.changeLanguage('vi')
      })
    }
  })
})

describe('ExamplesPage — phân trang trên URL', () => {
  it('nút Trang trước bị vô hiệu ở trang đầu', async () => {
    renderPage()
    await screen.findByText('Example A')
    expect(screen.getByRole('button', { name: /trang trước/i })).toBeDisabled()
  })

  it('danh sách rỗng (totalPages: 0) hiện "Trang 1 / 1" thay vì "Trang 1 / 0"', async () => {
    server.use(mswHttp.get(`${BASE}/examples`, () => paginated([])))
    renderPage()

    await screen.findByText('Chưa có dữ liệu.')
    expect(await screen.findByText('Trang 1 / 1 — 0 bản ghi')).toBeInTheDocument()
  })

  it('mở ?page=2&size=20 → gửi đúng trang/số dòng, hiện đúng trang', async () => {
    const requested: string[] = []
    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) => {
        requested.push(new URL(request.url).search)
        return paginated([exampleB], { page: 2, size: 20, total: 45 })
      }),
    )
    renderPage({ route: '/examples?page=2&size=20' })

    expect(await screen.findByText('Example B')).toBeInTheDocument()
    expect(requested).toEqual(['?page=2&size=20'])
    expect(screen.getByText('Trang 2 / 3 — 45 bản ghi')).toBeInTheDocument()
    expect(screen.getByLabelText('Số dòng mỗi trang')).toHaveValue('20')
  })

  it('bấm Trang sau → URL ?page=2', async () => {
    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
        return paginated([page === 1 ? example : exampleB], { page, total: 11 })
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Example A')

    await user.click(screen.getByRole('button', { name: /trang sau/i }))

    expect(await screen.findByText('Example B')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('?page=2')
  })

  it('chọn 20 dòng → URL ?size=20, về trang 1', async () => {
    const requested: string[] = []
    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) => {
        const params = new URL(request.url).searchParams
        requested.push(new URL(request.url).search)
        return paginated([example], {
          page: Number(params.get('page')),
          size: Number(params.get('size')),
          total: 45,
        })
      }),
    )
    const { user } = renderPage({ route: '/examples?page=3' })
    await screen.findByText('Example A')

    await user.selectOptions(screen.getByLabelText('Số dòng mỗi trang'), '20')

    await vi.waitFor(() => expect(requested.at(-1)).toBe('?page=1&size=20'))
    expect(screen.getByTestId('location').textContent).toBe('?size=20')
  })

  it('tự lùi về trang hợp lệ khi trang hiện tại vượt quá totalPages sau khi dữ liệu đổi', async () => {
    const requestedPages: string[] = []
    server.use(
      mswHttp.get(`${BASE}/examples`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        requestedPages.push(page)
        // Trang 1 có 1 bản ghi và còn trang sau; sau khi sang trang 2, bản ghi duy nhất của
        // trang 2 vừa bị xoá ở nơi khác — backend giờ báo totalPages: 1, page 2 không còn tồn tại.
        if (page === '1') return paginated([example], { page: 1, total: 11 })
        return paginated([], { page: 2, total: 1 })
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Example A')

    await user.click(screen.getByRole('button', { name: /trang sau/i }))

    // Component phải tự xin lại trang 1 vì trang 2 không còn tồn tại.
    await screen.findByText('Example A')
    // Trang 1 đã có trong cache: có thể hiện lại trước khi request thứ 3 tới MSW — chờ tường minh.
    await vi.waitFor(() => expect(requestedPages).toEqual(['1', '2', '1']))
    expect(screen.getByTestId('location').textContent).toBe('')
  })

  it('chuyển trang: giữ dòng cũ và khoá nút phân trang tới khi trang mới về', async () => {
    let releasePage2!: () => void
    const page2Ready = new Promise<void>((resolve) => {
      releasePage2 = resolve
    })
    server.use(
      mswHttp.get(`${BASE}/examples`, async ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        if (page === '2') {
          await page2Ready
          return paginated([exampleB], { page: 2, total: 11 })
        }
        return paginated([example], { page: 1, total: 11 })
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Example A')

    await user.click(screen.getByRole('button', { name: /trang sau/i }))

    // Trang 2 chưa về: bảng vẫn là dữ liệu trang 1, không nháy sang skeleton.
    expect(screen.getByText('Example A')).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /trang sau/i })).toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: /trang trước/i })).toBeDisabled()

    releasePage2()
    expect(await screen.findByText('Example B')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /trang trước/i })).toBeEnabled()
  })
})

describe('ExamplesPage — tạo / sửa / xoá', () => {
  it('tạo: gửi tên + mô tả, đóng dialog, tải lại danh sách', async () => {
    let body: unknown
    let listCalls = 0
    server.use(
      mswHttp.get(`${BASE}/examples`, () => {
        listCalls += 1
        return paginated([example])
      }),
      mswHttp.post(`${BASE}/examples`, async ({ request }) => {
        body = await request.json()
        return ok(exampleB)
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Example A')
    const callsBefore = listCalls

    await user.click(screen.getByRole('button', { name: /tạo example/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Tên', { exact: false }), 'Example B')
    await user.type(within(dialog).getByLabelText('Mô tả'), 'mới')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(body).toEqual({ name: 'Example B', description: 'mới' })
    await vi.waitFor(() => expect(listCalls).toBeGreaterThan(callsBefore))
    expect(toast.success).toHaveBeenCalledWith('Đã tạo example')
  })

  it('tạo trùng tên (422/999902) → lỗi dưới ô Tên, dialog vẫn mở, không toast', async () => {
    server.use(
      mswHttp.post(`${BASE}/examples`, () => apiError(422, 999902, 'Example name does exist')),
    )
    const { user } = renderPage()
    await screen.findByText('Example A')

    await user.click(screen.getByRole('button', { name: /tạo example/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Tên', { exact: false }), 'Example A')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }))

    expect(await within(dialog).findByText('Tên example đã tồn tại')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('khi sửa, gửi version của đúng bản ghi đang sửa', async () => {
    let body: unknown
    server.use(
      mswHttp.patch(`${BASE}/examples/example-a`, async ({ request }) => {
        body = await request.json()
        return ok(example)
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Example A')

    await user.click(screen.getByRole('button', { name: 'Sửa' }))
    const nameInput = await screen.findByLabelText('Tên', { exact: false })
    await user.clear(nameInput)
    await user.type(nameInput, 'Example B')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() =>
      expect(body).toEqual({ name: 'Example B', description: 'mô tả', version: 3 }),
    )
  })

  it('xung đột version (409/100800) → đúng 1 toast, đóng dialog và tải lại danh sách', async () => {
    let listCalls = 0
    let patchCalls = 0
    server.use(
      mswHttp.get(`${BASE}/examples`, () => {
        listCalls += 1
        return paginated([example])
      }),
      mswHttp.patch(`${BASE}/examples/example-a`, () => {
        patchCalls += 1
        return apiError(409, 100800, 'Data has been modified by another request')
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Example A')
    const callsBefore = listCalls

    await user.click(screen.getByRole('button', { name: 'Sửa' }))
    const dialog = await screen.findByRole('dialog')
    // Lưu bị khoá tới khi form khác giá trị gốc — đổi tên để mở khoá trước khi bấm.
    await user.type(within(dialog).getByLabelText('Tên', { exact: false }), ' mới')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await vi.waitFor(() => expect(listCalls).toBeGreaterThan(callsBefore))
    // Spec yêu cầu KHÔNG tự động retry khi gặp version conflict — 1 lần Lưu chỉ sinh đúng 1 PATCH.
    expect(patchCalls).toBe(1)
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      'Dữ liệu vừa bị người khác thay đổi. Hãy tải lại rồi thử lại.',
    )
  })

  it('xoá: hỏi xác nhận bằng alertdialog, xác nhận → gửi DELETE rồi đóng hộp', async () => {
    let deleted = false
    server.use(
      mswHttp.delete(`${BASE}/examples/example-a`, () => {
        deleted = true
        return ok('example-a')
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Example A')

    await user.click(screen.getByRole('button', { name: 'Xoá' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Xoá Example A? Thao tác này không hoàn tác được.')
    expect(deleted).toBe(false)

    await user.click(within(dialog).getByRole('button', { name: 'Xoá' }))

    await vi.waitFor(() => expect(deleted).toBe(true))
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('xoá: bấm Huỷ → đóng hộp, không gửi DELETE', async () => {
    let deleted = false
    server.use(
      mswHttp.delete(`${BASE}/examples/example-a`, () => {
        deleted = true
        return ok('example-a')
      }),
    )
    const { user } = renderPage()
    await screen.findByText('Example A')

    await user.click(screen.getByRole('button', { name: 'Xoá' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }))

    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(deleted).toBe(false)
  })
})
