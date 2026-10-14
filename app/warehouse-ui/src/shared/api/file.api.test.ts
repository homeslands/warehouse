import { describe, expect, it, vi } from 'vitest'
import { http } from './http'
import { fileDisplayName, parseUploadedKey, uploadFile } from './file.api'

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
