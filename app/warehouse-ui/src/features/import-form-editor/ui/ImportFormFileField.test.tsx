import { zodResolver } from '@hookform/resolvers/zod'
import { screen } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { Form } from '@/shared/ui/form'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormFileField } from './ImportFormFileField'
import {
  emptyFormValues,
  importFormSchema,
  type ImportFormValues,
} from '../model/import-form-editor.schema'

const BASE = 'http://localhost:8085/api/v1'
let current: ImportFormValues | undefined

function Harness({ file = '' }: { file?: string }) {
  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: { ...emptyFormValues(new Date(2026, 9, 13)), file },
  })
  current = form.watch()
  return (
    <Form {...form}>
      <ImportFormFileField form={form} onUploadingChange={vi.fn()} />
    </Form>
  )
}

describe('ImportFormFileField', () => {
  it('chọn file → upload → hiện tên dễ đọc, form giữ key', async () => {
    server.use(
      mswHttp.post(`${BASE}/file/upload`, () =>
        HttpResponse.json(
          {
            message: 'File hoa-don-1760000000000.pdf uploaded to S3 successfully',
            statusCode: 201,
            timestamp: '',
          },
          { status: 201 },
        ),
      ),
    )
    const { user } = renderWithProviders(<Harness />)
    await user.upload(screen.getByLabelText('Chứng từ đính kèm'), new File(['x'], 'hoa don.pdf'))
    expect(await screen.findByText('hoa-don.pdf')).toBeInTheDocument()
    expect(current?.file).toBe('hoa-don-1760000000000.pdf')
  })

  it('file > 10 MB → lỗi tại ô, không gọi upload', async () => {
    const upload = vi.fn()
    server.use(mswHttp.post(`${BASE}/file/upload`, upload))
    const { user } = renderWithProviders(<Harness />)
    const big = new File(['x'], 'big.pdf')
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
    await user.upload(screen.getByLabelText('Chứng từ đính kèm'), big)
    expect(await screen.findByText('File tối đa 10 MB.')).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('upload lỗi → câu lỗi tại ô', async () => {
    server.use(mswHttp.post(`${BASE}/file/upload`, () => HttpResponse.json({}, { status: 500 })))
    const { user } = renderWithProviders(<Harness />)
    await user.upload(screen.getByLabelText('Chứng từ đính kèm'), new File(['x'], 'a.pdf'))
    expect(await screen.findByText('Tải file lên không thành công, thử lại.')).toBeInTheDocument()
  })

  it('đã có file → gỡ → form giữ ""', async () => {
    const { user } = renderWithProviders(<Harness file="cu-1760000000000.png" />)
    expect(screen.getByText('cu.png')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gỡ file' }))
    expect(current?.file).toBe('')
    expect(screen.queryByText('cu.png')).not.toBeInTheDocument()
  })
})
