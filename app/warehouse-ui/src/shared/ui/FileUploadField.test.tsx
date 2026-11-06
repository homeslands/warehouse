import { screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/shared/test/render'
import { Form } from './form'
import { FileUploadField } from './FileUploadField'

type Values = { file: string }
let current: Values | undefined
const messages = { tooLarge: 'importForms:fileTooLarge', failed: 'importForms:fileUploadFailed' }

type Extra = Pick<
  ComponentProps<typeof FileUploadField<Values>>,
  'accept' | 'validate' | 'uploadErrorMessage' | 'hint' | 'disabledReason'
>

function Harness({
  upload,
  file = '',
  ...extra
}: { upload: (f: File) => Promise<string>; file?: string } & Extra) {
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
        {...extra}
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

  it('không truyền tuỳ chọn mới (phiếu xuất) → không có accept, gợi ý chung, lỗi luôn là failed', async () => {
    const upload = vi.fn().mockRejectedValue({ statusCode: 403, message: 'Forbidden resource' })
    const { user } = renderWithProviders(<Harness upload={upload} />)
    expect(screen.getByLabelText('Đính kèm')).not.toHaveAttribute('accept')
    expect(screen.getByText(/^Tối đa 10 MB\./)).toBeInTheDocument()
    await user.upload(screen.getByLabelText('Đính kèm'), new File(['x'], 'a.exe'))
    expect(await screen.findByText('Tải file lên không thành công, thử lại.')).toBeInTheDocument()
  })

  it('validate trả khoá lỗi → hiện câu đó, không gọi upload', async () => {
    const upload = vi.fn()
    const { user } = renderWithProviders(
      <Harness upload={upload} validate={() => 'importForms:fileTypeNotAllowed'} />,
    )
    await user.upload(screen.getByLabelText('Đính kèm'), new File(['x'], 'a.pdf'))
    expect(
      await screen.findByText(
        'Chỉ nhận file pdf, jpg, jpeg, png, webp, xls, xlsx, doc, docx (đuôi phải đúng loại file).',
      ),
    ).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('uploadErrorMessage nhận đúng lỗi của upload và quyết định câu hiện ra', async () => {
    const error = { statusCode: 422, code: 121001, message: 'too big' }
    const upload = vi.fn().mockRejectedValue(error)
    const uploadErrorMessage = vi.fn(() => 'importForms:fileMissing')
    const { user } = renderWithProviders(
      <Harness upload={upload} uploadErrorMessage={uploadErrorMessage} />,
    )
    await user.upload(screen.getByLabelText('Đính kèm'), new File(['x'], 'a.pdf'))
    expect(await screen.findByText('Chưa nhận được file, hãy chọn lại.')).toBeInTheDocument()
    expect(uploadErrorMessage).toHaveBeenCalledWith(error)
  })

  it('accept + hint được truyền xuống', () => {
    renderWithProviders(<Harness upload={vi.fn()} accept=".pdf,.png" hint="Gợi ý riêng" />)
    expect(screen.getByLabelText('Đính kèm')).toHaveAttribute('accept', '.pdf,.png')
    expect(screen.getByText('Gợi ý riêng')).toBeInTheDocument()
  })

  it('disabledReason → khoá nút + input, lý do thay gợi ý; chọn file không gọi upload', async () => {
    const upload = vi.fn()
    const { user } = renderWithProviders(
      <Harness upload={upload} hint="Gợi ý riêng" disabledReason="Không có quyền" />,
    )
    expect(screen.getByRole('button', { name: 'Chọn file' })).toBeDisabled()
    expect(screen.getByLabelText('Đính kèm')).toBeDisabled()
    expect(screen.getByText('Không có quyền')).toBeInTheDocument()
    expect(screen.queryByText('Gợi ý riêng')).not.toBeInTheDocument()
    await user.upload(screen.getByLabelText('Đính kèm'), new File(['x'], 'a.pdf'))
    expect(upload).not.toHaveBeenCalled()
  })
})
