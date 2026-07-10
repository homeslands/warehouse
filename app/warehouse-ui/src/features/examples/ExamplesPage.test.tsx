import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { useAuthStore } from '@/shared/auth/auth.store'
import { ExamplesPage } from '@/features/examples/ExamplesPage'

const BASE = 'http://localhost:8085/api/v1'

const example = {
  id: '1',
  slug: 'example-a',
  name: 'Example A',
  description: 'mô tả',
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ExamplesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    mswHttp.get(`${BASE}/examples`, () =>
      HttpResponse.json({
        message: 'ok',
        statusCode: 200,
        timestamp: '',
        result: {
          items: [example],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          hasNext: false,
          hasPrevios: false,
        },
      }),
    ),
  )
})

describe('ExamplesPage', () => {
  it('hiện dữ liệu trả về từ API', async () => {
    useAuthStore.setState({
      token: 't',
      user: { userId: 'u', userName: 'root', roleName: 'SUPER_ADMIN', scope: '[]' },
      status: 'authenticated',
    })

    renderPage()
    expect(await screen.findByText('Example A')).toBeInTheDocument()
  })

  it('SUPER_ADMIN thấy nút Tạo', async () => {
    useAuthStore.setState({
      token: 't',
      user: { userId: 'u', userName: 'root', roleName: 'SUPER_ADMIN', scope: '[]' },
      status: 'authenticated',
    })

    renderPage()
    await screen.findByText('Example A')
    expect(screen.getByRole('button', { name: /tạo example/i })).toBeInTheDocument()
  })

  it('CUSTOMER KHÔNG thấy nút Tạo', async () => {
    useAuthStore.setState({
      token: 't',
      user: { userId: 'u', userName: 'khach', roleName: 'CUSTOMER', scope: '[]' },
      status: 'authenticated',
    })

    renderPage()
    await screen.findByText('Example A')
    expect(screen.queryByRole('button', { name: /tạo example/i })).not.toBeInTheDocument()
  })

  it('nút Trang trước bị vô hiệu ở trang đầu (hasPrevious=false)', async () => {
    useAuthStore.setState({
      token: 't',
      user: { userId: 'u', userName: 'root', roleName: 'SUPER_ADMIN', scope: '[]' },
      status: 'authenticated',
    })

    renderPage()
    await screen.findByText('Example A')
    expect(screen.getByRole('button', { name: /trang trước/i })).toBeDisabled()
  })
})
