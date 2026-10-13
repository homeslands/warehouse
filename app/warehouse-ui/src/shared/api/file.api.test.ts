/// <reference types="node" />
import { File as NodeFile } from 'node:buffer'
import { HttpResponse, http as mswHttp } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/shared/test/msw'
import { fileDisplayName, parseUploadedKey, uploadFile } from './file.api'

const BASE = 'http://localhost:8085/api/v1'

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
    let fieldName: string | null = null
    server.use(
      mswHttp.post(`${BASE}/file/upload`, async ({ request }) => {
        const body = await request.formData()
        fieldName = body.has('file') ? 'file' : null
        return HttpResponse.json(
          {
            message: 'File scan-1760000000000.png uploaded to S3 successfully',
            statusCode: 201,
            timestamp: '',
          },
          { status: 201 },
        )
      }),
    )
    // jsdom File không phải Blob của undici (FormData đọc được) — dùng File của Node để body multipart đúng.
    const key = await uploadFile(
      new NodeFile(['x'], 'scan.png', { type: 'image/png' }) as unknown as File,
    )
    expect(fieldName).toBe('file')
    expect(key).toBe('scan-1760000000000.png')
  })

  it('fileDisplayName: bỏ hậu tố -<timestamp 13 số> trước đuôi', () => {
    expect(fileDisplayName('hoa-don-1760000000000.pdf')).toBe('hoa-don.pdf')
    expect(fileDisplayName('import-forms/pn-1.pdf')).toBe('import-forms/pn-1.pdf')
    expect(fileDisplayName('')).toBe('')
  })
})
