import { screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { Form } from './form'
import { FileUploadField } from './FileUploadField'

type Values = { file: string }
let current: Values | undefined
const messages = { tooLarge: 'importForms:fileTooLarge', failed: 'importForms:fileUploadFailed' }

function Harness({ upload, file = '' }: { upload: (f: File) => Promise<string>; file?: string }) {
  const form = useForm<Values>({ defaultValues: { file } })
  current = form.watch()
  return (
    <Form {...form}>
      <FileUploadField
        form={form}
        name="file"
        label="Đính kèm"
        upload={upload}
        displayName={(v) => `tên:${v}`}
        onUploadingChange={vi.fn()}
        messages={messages}
      />
    </Form>
  )
}

describe('FileUploadField', () => {
  it('thành công → giá trị = chuỗi upload trả, hiện displayName', async () => {
    const upload = vi.fn().mockResolvedValue('key-1')
    const { user } = renderWithProviders(<Harness upload={upload} />)
    await user.upload(screen.getByLabelText('Đính kèm'), new File(['x'], 'a.pdf'))
    expect(await screen.findByText('tên:key-1')).toBeInTheDocument()
    expect(current?.file).toBe('key-1')
  })

  it('file > 10 MB → lỗi tooLarge, không gọi upload', async () => {
    const upload = vi.fn()
    const { user } = renderWithProviders(<Harness upload={upload} />)
    const big = new File(['x'], 'big.pdf')
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
    await user.upload(screen.getByLabelText('Đính kèm'), big)
    expect(await screen.findByText('File tối đa 10 MB.')).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('upload reject → lỗi failed', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('x'))
    const { user } = renderWithProviders(<Harness upload={upload} />)
    await user.upload(screen.getByLabelText('Đính kèm'), new File(['x'], 'a.pdf'))
    expect(await screen.findByText('Tải file lên không thành công, thử lại.')).toBeInTheDocument()
    expect(current?.file).toBe('')
  })
})
