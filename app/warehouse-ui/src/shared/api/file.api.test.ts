import { describe, expect, it, vi } from 'vitest'
import { http } from './http'
import {
  FILE_MAX_BYTES,
  FILE_UPLOAD_ACCEPT,
  fileDisplayName,
  isAllowedUploadFile,
  parseUploadedKey,
  uploadErrorKind,
  uploadFile,
} from './file.api'
import type { ApiError } from './types'

describe('file.api', () => {
  it('parseUploadedKey: bóc key từ message của backend', () => {
    expect(parseUploadedKey('File hoa-don-1760000000000.pdf uploaded to S3 successfully')).toBe(
      'hoa-don-1760000000000.pdf',
    )
  })

  it('parseUploadedKey: message lạ → ném lỗi nêu rõ message', () => {
    expect(() => parseUploadedKey('Uploaded')).toThrow(/Uploaded/)
  })

  it('uploadFile: gửi multipart field "file", trả key', async () => {
    // Spy thay vì MSW: FormData chứa File của jsdom không serialize được qua undici trong môi trường test.
    const post = vi.spyOn(http, 'post').mockResolvedValue({
      data: { message: 'File scan-1760000000000.png uploaded to S3 successfully', statusCode: 201 },
    })
    const file = new File(['x'], 'scan.png', { type: 'image/png' })
    const key = await uploadFile(file)
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0]
    expect(url).toBe('/file/upload')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('file')).toBe(file)
    expect(key).toBe('scan-1760000000000.png')
    post.mockRestore()
  })

  it('fileDisplayName: bỏ hậu tố -<timestamp 13 số> trước đuôi', () => {
    expect(fileDisplayName('hoa-don-1760000000000.pdf')).toBe('hoa-don.pdf')
    expect(fileDisplayName('import-forms/pn-1.pdf')).toBe('import-forms/pn-1.pdf')
    expect(fileDisplayName('')).toBe('')
  })
})

const apiErr = (statusCode: number, code?: number, message = 'Error'): ApiError => ({
  statusCode,
  ...(code === undefined ? {} : { code }),
  timestamp: '',
  path: '/api/v1/file/upload',
  method: 'POST',
  message,
})

describe('ràng buộc POST /file/upload (BE #168 / #184)', () => {
  it('FILE_MAX_BYTES = 10 MB (BE nhận cả file đúng 10 485 760 byte)', () => {
    expect(FILE_MAX_BYTES).toBe(10_485_760)
  })

  it('accept liệt kê đúng 9 đuôi backend cho phép', () => {
    expect(FILE_UPLOAD_ACCEPT).toBe('.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc')
  })

  it.each([
    ['hoa-don.pdf', 'application/pdf'],
    ['anh.jpg', 'image/jpeg'],
    ['anh.JPEG', 'image/jpeg'],
    ['anh.png', 'image/png'],
    ['anh.webp', 'image/webp'],
    ['bang.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['bang.xls', 'application/vnd.ms-excel'],
    ['van-ban.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['van-ban.doc', 'application/msword'],
  ])('cho phép %s (%s)', (name, type) => {
    expect(isAllowedUploadFile({ name, type })).toBe(true)
  })

  it.each([
    ['ngoài allowlist', 'ghi-chu.txt', 'text/plain'],
    ['ngoài allowlist (csv)', 'bang.csv', 'text/csv'],
    ['không có đuôi', 'hoadon', 'application/pdf'],
    ['đuôi đúng, mimetype khác (đổi đuôi)', 'virus.pdf', 'application/x-msdownload'],
    ['đuôi pdf, mimetype ảnh', 'a.pdf', 'image/png'],
    ['mimetype rỗng (trình duyệt gửi octet-stream)', 'a.pdf', ''],
    ['nhiều chấm, đuôi cuối không hợp lệ', 'a.pdf.exe', 'application/pdf'],
  ])('chặn: %s — %s', (_case, name, type) => {
    expect(isAllowedUploadFile({ name, type })).toBe(false)
  })

  it.each([
    [apiErr(422, 121012, 'File type is not allowed'), 'typeNotAllowed'],
    [apiErr(422, 121001, 'File size exceed limit allowed'), 'tooLarge'],
    [apiErr(422, 121000, 'File not found'), 'missing'],
    [apiErr(403, undefined, 'Forbidden resource'), 'forbidden'],
    [apiErr(403, undefined, 'Forbidden'), 'forbidden'],
    [apiErr(422, 121003, 'Limit unexpected file'), 'failed'],
    [apiErr(500, undefined, 'Internal server error'), 'failed'],
    [new Error('Network Error'), 'failed'],
    [undefined, 'failed'],
  ] as const)('uploadErrorKind(%o) → %s', (error, kind) => {
    expect(uploadErrorKind(error)).toBe(kind)
  })
})
