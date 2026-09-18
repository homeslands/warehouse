import { screen } from '@testing-library/react'
import { http as mswHttp } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { toast } from 'sonner'
import { ok } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import type { Example } from '@/entities/example'
import { ExampleFormDialog } from './ExampleFormDialog'

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
  vi.mocked(toast.success).mockClear()
})

describe('ExampleFormDialog — tạo mới', () => {
  it('bỏ trống Tên → không gửi request, báo lỗi dưới Tên, focus vào Tên', async () => {
    let called = false
    server.use(
      mswHttp.post(`${BASE}/examples`, () => {
        called = true
        return ok(example)
      }),
    )
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(<ExampleFormDialog open onOpenChange={onOpenChange} />, {
      auth: 'admin',
    })

    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Vui lòng nhập tên')).toBeInTheDocument()
    expect(called).toBe(false)
    expect(screen.getByLabelText('Tên', { exact: false })).toHaveFocus()
  })
})

describe('ExampleFormDialog — sửa', () => {
  it('Lưu bị khoá khi mở, mở khoá khi đổi tên, khoá lại khi trả về giá trị gốc', async () => {
    const onOpenChange = vi.fn()
    const { user } = renderWithProviders(
      <ExampleFormDialog open onOpenChange={onOpenChange} example={example} />,
      { auth: 'admin' },
    )

    const nameInput = await screen.findByDisplayValue('Example A')
    const saveButton = screen.getByRole('button', { name: 'Lưu' })
    expect(saveButton).toBeDisabled()

    await user.type(nameInput, ' B')
    expect(saveButton).toBeEnabled()

    await user.type(nameInput, '{Backspace}{Backspace}')
    expect(saveButton).toBeDisabled()
  })
})
