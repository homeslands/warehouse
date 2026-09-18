import { screen } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { apiError } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { Example } from '@/entities/example'
import { ExampleFormDialog } from '@/features/example-form'
import { queryClient } from '@/app/query-client'

// Ở tầng app vì cần queryClient THẬT (có handler toast global) cùng dialog thật — chỉ vậy mới đếm
// được "đúng một toast": handler global + dialog cộng lại.
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

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
})

afterEach(() => queryClient.clear())

async function submitCreate(name: string) {
  const onOpenChange = vi.fn()
  const { user } = renderWithProviders(<ExampleFormDialog open onOpenChange={onOpenChange} />, {
    queryClient,
  })
  await user.type(screen.getByLabelText('Tên', { exact: false }), name)
  await user.click(screen.getByRole('button', { name: 'Lưu' }))
  return { onOpenChange }
}

describe('lỗi khi lưu example (queryClient thật của app)', () => {
  it('tạo trùng tên (422/999902) → lỗi dưới ô Tên, KHÔNG toast', async () => {
    server.use(
      mswHttp.post(`${BASE}/examples`, () => apiError(422, 999902, 'Example name does exist')),
    )

    const { onOpenChange } = await submitCreate('trung')

    expect(await screen.findByText('Tên example đã tồn tại')).toBeInTheDocument()
    expect(screen.getByLabelText('Tên', { exact: false })).toHaveAttribute('aria-invalid', 'true')
    expect(toast.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('lỗi không thuộc ô nào (500) → ĐÚNG 1 toast', async () => {
    server.use(mswHttp.post(`${BASE}/examples`, () => apiError(500, undefined, 'boom')))

    await submitCreate('moi')

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
  })

  it('sửa bị xung đột version (409/100800) → ĐÚNG 1 toast và đóng dialog', async () => {
    server.use(
      mswHttp.patch(`${BASE}/examples/example-a`, () =>
        apiError(409, 100800, 'Data has been modified'),
      ),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ExampleFormDialog open onOpenChange={onOpenChange} example={example} />,
      { queryClient },
    )

    // Lưu bị khoá tới khi form khác giá trị gốc — đổi tên để mở khoá trước khi bấm.
    await user.type(screen.getByLabelText('Tên', { exact: false }), ' moi')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(toast.error).toHaveBeenCalledTimes(1)
  })
})
