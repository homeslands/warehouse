// fake-api PHẢI được import trước mọi module kéo `@/shared/api/http` vào (xem fake-api.ts).
import { callsTo, failure, ok, resetFakeApi, route } from '@/shared/api/testing/fake-api'

import { installRnFormData } from '@/shared/api/testing/rn-form-data'

import {
  isAttachmentUploading,
  resetAttachmentUploads,
  startAttachmentUpload,
} from './upload.store'

const URL_IMPORT = '/warehouses/wh-a/import-forms/upload-file'
const URL_EXPORT = '/warehouses/wh-a/export-forms/upload-file'
const S3 = 'https://b.s3.amazonaws.com/import-forms/hoa-don-1762000000000.pdf'
const file = { uri: 'file:///c/hoa-don.pdf', name: 'hoa-don.pdf', mimeType: 'application/pdf' }

/** Trả lời bị giữ lại cho tới khi test gọi `release`. */
function deferred<T>() {
  let release!: (v: T) => void
  const promise = new Promise<T>((r) => (release = r))
  return { promise, release }
}

let restoreFormData: () => void
beforeEach(() => {
  resetFakeApi()
  resetAttachmentUploads()
  restoreFormData = installRnFormData()
})
afterEach(() => restoreFormData())

describe('startAttachmentUpload', () => {
  it('thành công, khoá còn nguyên → onDone(url) đúng 1 lần, gửi đúng kho / loại phiếu', async () => {
    route('post', URL_IMPORT, () => ok(S3))
    const onDone = jest.fn()
    const r = await startAttachmentUpload({
      kind: 'import',
      warehouseSlug: 'wh-a',
      formKey: 'k1',
      file,
      getFormKey: () => 'k1',
      onDone,
    })
    expect(r).toEqual({ status: 'done', url: S3 })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(S3)
    expect(callsTo('post', URL_IMPORT)).toHaveLength(1)
  })

  it('phiếu xuất → endpoint của phiếu xuất', async () => {
    route('post', URL_EXPORT, () => ok(S3))
    const onDone = jest.fn()
    await startAttachmentUpload({
      kind: 'export',
      warehouseSlug: 'wh-a',
      formKey: 'k',
      file,
      getFormKey: () => 'k',
      onDone,
    })
    expect(callsTo('post', URL_EXPORT)).toHaveLength(1)
    expect(onDone).toHaveBeenCalledWith(S3)
  })

  it('getFormKey() đổi trước khi xong (bỏ nháp / rời / đổi phiếu) → KHÔNG gọi onDone', async () => {
    const reply = deferred<ReturnType<typeof ok>>()
    route('post', URL_IMPORT, () => reply.promise)
    let key: string | null = 'k1'
    const onDone = jest.fn()
    const p = startAttachmentUpload({
      kind: 'import',
      warehouseSlug: 'wh-a',
      formKey: 'k1',
      file,
      getFormKey: () => key,
      onDone,
    })
    key = 'k2'
    reply.release(ok(S3))
    expect(await p).toEqual({ status: 'stale' })
    expect(onDone).not.toHaveBeenCalled()
  })

  it('lỗi → trả lỗi, KHÔNG gọi onDone', async () => {
    route('post', URL_IMPORT, () => failure(400, 121001))
    const onDone = jest.fn()
    const r = await startAttachmentUpload({
      kind: 'import',
      warehouseSlug: 'wh-a',
      formKey: 'k',
      file,
      getFormKey: () => 'k',
      onDone,
    })
    expect(r.status).toBe('error')
    expect(r.status === 'error' && (r.error as { code?: number }).code).toBe(121001)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('cờ isAttachmentUploading bật trong lúc tải (đúng loại phiếu), tắt sau khi xong / lỗi', async () => {
    const first = deferred<ReturnType<typeof ok>>()
    route('post', URL_IMPORT, () => first.promise)
    expect(isAttachmentUploading('import')).toBe(false)
    const p = startAttachmentUpload({
      kind: 'import',
      warehouseSlug: 'wh-a',
      formKey: 'k',
      file,
      getFormKey: () => 'k',
      onDone: () => {},
    })
    expect(isAttachmentUploading('import')).toBe(true)
    expect(isAttachmentUploading('export')).toBe(false)
    first.release(ok(S3))
    await p
    expect(isAttachmentUploading('import')).toBe(false)

    const second = deferred<ReturnType<typeof ok>>()
    route('post', URL_IMPORT, () => second.promise)
    const q = startAttachmentUpload({
      kind: 'import',
      warehouseSlug: 'wh-a',
      formKey: 'k',
      file,
      getFormKey: () => 'k',
      onDone: () => {},
    })
    expect(isAttachmentUploading('import')).toBe(true)
    second.release(failure(500))
    await q
    expect(isAttachmentUploading('import')).toBe(false)
  })

  it('kết quả bị bỏ (stale) cũng tắt cờ', async () => {
    route('post', URL_IMPORT, () => ok(S3))
    await startAttachmentUpload({
      kind: 'import',
      warehouseSlug: 'wh-a',
      formKey: 'k',
      file,
      getFormKey: () => null,
      onDone: () => {},
    })
    expect(isAttachmentUploading('import')).toBe(false)
  })
})
