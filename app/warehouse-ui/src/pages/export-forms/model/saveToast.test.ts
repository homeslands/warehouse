import i18n from 'i18next'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportForm } from '@/entities/export-form'
import { toastExportSaveOutcome } from './saveToast'

const t = i18n.getFixedT('vi', 'exportForms')
const form = { code: 'PX-0001', slug: 'xf-1', warehouseSlug: 'w-a' } as ExportForm
const boom = { statusCode: 409, code: 100817, message: 'Inventory available insufficient' }

describe('toastExportSaveOutcome', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['draft', 'Đã lưu nháp PX-0001'],
    ['submitted', 'Đã gửi duyệt PX-0001'],
    ['confirmed', 'Đã xuất kho PX-0001'],
  ] as const)('tạo, %s → "%s" kèm nút Xem', (stage, text) => {
    const success = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    const onView = vi.fn()
    toastExportSaveOutcome(t, { form, stage }, true, onView)
    expect(success).toHaveBeenCalledTimes(1)
    const [msg, opts] = success.mock.calls[0]
    expect(msg).toBe(text)
    expect(opts?.action).toMatchObject({ label: 'Xem' })
  })

  it('sửa nháp + Lưu → "Đã lưu PX-0001", không nút Xem', () => {
    const success = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    toastExportSaveOutcome(t, { form, stage: 'draft' }, false, vi.fn())
    expect(success).toHaveBeenCalledTimes(1)
    expect(success.mock.calls[0][0]).toBe('Đã lưu PX-0001')
    expect(success.mock.calls[0][1]?.action).toBeUndefined()
  })

  it('sửa + gửi duyệt → "Đã gửi duyệt PX-0001", không nút Xem', () => {
    const success = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    toastExportSaveOutcome(t, { form, stage: 'submitted' }, false)
    expect(success.mock.calls[0][0]).toBe('Đã gửi duyệt PX-0001')
    expect(success.mock.calls[0][1]?.action).toBeUndefined()
  })

  it('nháp + lỗi → cảnh báo "chưa gửi duyệt được", lý do ở description, có Xem', () => {
    const warning = vi.spyOn(toast, 'warning').mockImplementation(() => 'id')
    const success = vi.spyOn(toast, 'success').mockImplementation(() => 'id')
    toastExportSaveOutcome(t, { form, stage: 'draft', error: boom }, true, vi.fn())
    expect(success).not.toHaveBeenCalled()
    const [msg, opts] = warning.mock.calls[0]
    expect(msg).toBe('Đã lưu nháp PX-0001 nhưng chưa gửi duyệt được')
    expect(opts?.description).toEqual(expect.any(String))
    expect(opts?.description).not.toBe('')
    expect(opts?.action).toMatchObject({ label: 'Xem' })
  })

  it('đã gửi duyệt + lỗi xác nhận → cảnh báo "chưa xác nhận được"', () => {
    const warning = vi.spyOn(toast, 'warning').mockImplementation(() => 'id')
    toastExportSaveOutcome(
      t,
      {
        form,
        stage: 'submitted',
        error: { statusCode: 500, code: 100500, message: 'boom' },
      },
      false,
    )
    const [msg, opts] = warning.mock.calls[0]
    expect(msg).toBe('Đã gửi duyệt PX-0001 nhưng chưa xác nhận được')
    expect(opts?.description).toBe('boom')
    expect(opts?.action).toBeUndefined()
  })
})
