import { zodResolver } from '@hookform/resolvers/zod'
import { fireEvent, screen } from '@testing-library/react'
import { HttpResponse, http as mswHttp } from 'msw'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { Form } from '@/shared/ui/form'
import { apiError } from '@/shared/test/api'
import { server } from '@/shared/test/msw'
import { renderWithProviders } from '@/shared/test/render'
import { ImportFormFileField } from './ImportFormFileField'
import {
  emptyFormValues,
  importFormSchema,
  type ImportFormValues,
} from '../model/import-form-editor.schema'

const BASE = 'http://localhost:8085/api/v1'
const PDF = { type: 'application/pdf' }
const fileInput = () => screen.getByLabelText('Chứng từ đính kèm')
let current: ImportFormValues | undefined

function Harness({
  file = '',
  withErrorButton = false,
  canUpload = true,
}: {
  file?: string
  withErrorButton?: boolean
  canUpload?: boolean
}) {
  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: { ...emptyFormValues(new Date(2026, 9, 13)), file },
  })
  current = form.watch()
  return (
    <Form {...form}>
      <ImportFormFileField form={form} onUploadingChange={vi.fn()} canUpload={canUpload} />
      {withErrorButton && (
        <button
          type="button"
          onClick={() =>
            form.setError('file', { type: 'server', message: 'importForms:fileUploadFailed' })
          }
        >
          đặt lỗi
        </button>
      )}
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
    await user.upload(
      screen.getByLabelText('Chứng từ đính kèm'),
      new File(['x'], 'hoa don.pdf', PDF),
    )
    expect(await screen.findByText('hoa-don.pdf')).toBeInTheDocument()
    expect(current?.file).toBe('hoa-don-1760000000000.pdf')
  })

  it('file > 10 MB → lỗi tại ô, không gọi upload', async () => {
    const upload = vi.fn()
    server.use(mswHttp.post(`${BASE}/file/upload`, upload))
    const { user } = renderWithProviders(<Harness />)
    const big = new File(['x'], 'big.pdf', PDF)
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
    await user.upload(screen.getByLabelText('Chứng từ đính kèm'), big)
    expect(await screen.findByText('File tối đa 10 MB.')).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('upload lỗi → câu lỗi tại ô', async () => {
    server.use(mswHttp.post(`${BASE}/file/upload`, () => HttpResponse.json({}, { status: 500 })))
    const { user } = renderWithProviders(<Harness />)
    await user.upload(screen.getByLabelText('Chứng từ đính kèm'), new File(['x'], 'a.pdf', PDF))
    expect(await screen.findByText('Tải file lên không thành công, thử lại.')).toBeInTheDocument()
  })

  it('đã có file → gỡ → form giữ ""', async () => {
    const { user } = renderWithProviders(<Harness file="cu-1760000000000.png" />)
    expect(screen.getByText('cu.png')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gỡ file' }))
    expect(current?.file).toBe('')
    expect(screen.queryByText('cu.png')).not.toBeInTheDocument()
  })

  it('gỡ file → xoá cả lỗi cũ của ô file', async () => {
    const { user } = renderWithProviders(<Harness file="cu-1760000000000.png" withErrorButton />)
    await user.click(screen.getByRole('button', { name: 'đặt lỗi' }))
    expect(await screen.findByText('Tải file lên không thành công, thử lại.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gỡ file' }))
    expect(screen.queryByText('Tải file lên không thành công, thử lại.')).not.toBeInTheDocument()
  })

  it('input file ẩn không nằm trong thứ tự Tab', () => {
    renderWithProviders(<Harness />)
    expect(screen.getByLabelText('Chứng từ đính kèm')).toHaveAttribute('tabindex', '-1')
  })

  it('input có accept đúng 9 đuôi backend cho phép', () => {
    renderWithProviders(<Harness />)
    expect(fileInput()).toHaveAttribute(
      'accept',
      '.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc',
    )
  })

  it('dòng gợi ý nêu loại file và giới hạn 10 MB', () => {
    renderWithProviders(<Harness />)
    expect(
      screen.getByText(
        'PDF, ảnh (JPG, PNG, WEBP), Excel hoặc Word; tối đa 10 MB. Hệ thống chưa hỗ trợ tải file về — chỉ lưu kèm phiếu.',
      ),
    ).toBeInTheDocument()
  })

  describe('chặn loại file phía client — không gọi upload', () => {
    // `fireEvent` thay `user.upload`: user-event tự lọc theo `accept` nên file sai loại không tới được onChange —
    // nhưng người dùng chọn "Tất cả file" trong hộp thoại thì vẫn tới.
    it.each([
      ['ngoài allowlist', new File(['x'], 'ghi-chu.txt', { type: 'text/plain' })],
      [
        'đuôi pdf nhưng mimetype khác',
        new File(['x'], 'a.pdf', { type: 'application/x-msdownload' }),
      ],
      ['mimetype rỗng', new File(['x'], 'a.docx')],
    ])('%s → câu lỗi loại file tại ô, nút chọn file trỏ tới câu lỗi', async (_case, file) => {
      const upload = vi.fn()
      server.use(mswHttp.post(`${BASE}/file/upload`, upload))
      renderWithProviders(<Harness />)
      fireEvent.change(fileInput(), { target: { files: [file] } })
      const message = await screen.findByText(
        'Chỉ nhận file pdf, jpg, jpeg, png, webp, xls, xlsx, doc, docx (đuôi phải đúng loại file).',
      )
      // Nút "Chọn file" (chỗ focus thật) trỏ tới câu lỗi để screen reader đọc kèm.
      const choose = screen.getByRole('button', { name: 'Chọn file' })
      expect(choose).toHaveAttribute('aria-invalid', 'true')
      expect(choose).toHaveAttribute('aria-describedby', message.id)
      expect(upload).not.toHaveBeenCalled()
      expect(current?.file).toBe('')
    })
  })

  describe('map lỗi backend của POST /file/upload (mock MSW)', () => {
    it.each([
      [
        '422 / 121012 sai loại',
        () => apiError(422, 121012, 'File type is not allowed'),
        'Chỉ nhận file pdf, jpg, jpeg, png, webp, xls, xlsx, doc, docx (đuôi phải đúng loại file).',
      ],
      [
        '422 / 121001 quá 10 MB',
        () => apiError(422, 121001, 'File size exceed limit allowed'),
        'File tối đa 10 MB.',
      ],
      [
        '422 / 121000 thiếu file',
        () => apiError(422, 121000, 'File not found'),
        'Chưa nhận được file, hãy chọn lại.',
      ],
      [
        '403 thiếu FILE_CREATE',
        () => apiError(403, undefined, 'Forbidden resource'),
        'Bạn không có quyền tải file lên.',
      ],
      [
        '422 / mã multer khác → câu chung',
        () => apiError(422, 121003, 'Limit unexpected file'),
        'Tải file lên không thành công, thử lại.',
      ],
    ])('%s → câu riêng tại ô', async (_case, respond, expected) => {
      server.use(mswHttp.post(`${BASE}/file/upload`, respond))
      const { user } = renderWithProviders(<Harness />)
      await user.upload(fileInput(), new File(['x'], 'a.pdf', PDF))
      expect(await screen.findByText(expected)).toBeInTheDocument()
      expect(current?.file).toBe('')
    })
  })

  describe('thiếu FILE_CREATE', () => {
    it('khoá nút chọn file và input, nói lý do thay dòng gợi ý; không gọi upload', async () => {
      const upload = vi.fn()
      server.use(mswHttp.post(`${BASE}/file/upload`, upload))
      const { user } = renderWithProviders(<Harness canUpload={false} />)
      const choose = screen.getByRole('button', { name: 'Chọn file' })
      expect(choose).toBeDisabled()
      expect(fileInput()).toBeDisabled()
      const reason = screen.getByText(
        'Bạn không có quyền tải file lên (cần quyền “Tải file đính kèm lên”).',
      )
      expect(choose).toHaveAttribute('aria-describedby', reason.id)
      expect(screen.queryByText(/tối đa 10 MB/)).not.toBeInTheDocument()
      await user.upload(fileInput(), new File(['x'], 'a.pdf', PDF))
      expect(upload).not.toHaveBeenCalled()
    })

    it('phiếu đã có file → vẫn hiện tên và gỡ được', async () => {
      const { user } = renderWithProviders(
        <Harness canUpload={false} file="cu-1760000000000.png" />,
      )
      expect(screen.getByText('cu.png')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Gỡ file' }))
      expect(current?.file).toBe('')
      expect(screen.getByRole('button', { name: 'Chọn file' })).toBeDisabled()
    })
  })
})
