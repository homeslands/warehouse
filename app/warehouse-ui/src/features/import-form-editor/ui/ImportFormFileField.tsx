import { FileIcon, Loader2Icon, PaperclipIcon, XIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { FILE_MAX_BYTES, fileDisplayName, uploadFile } from '@/shared/api/file.api'
import { Button } from '@/shared/ui/button'
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form'
import type { ImportFormValues } from '../model/import-form-editor.schema'

type Props = {
  form: UseFormReturn<ImportFormValues>
  /** Trang khoá nút Lưu khi đang tải lên. */
  onUploadingChange: (uploading: boolean) => void
}

/**
 * Chọn file là tải lên ngay; form chỉ giữ `key`. Không có link tải về — backend chưa có endpoint (nợ kỹ thuật).
 * `<input type="file">` ẩn, nối nhãn qua `id` để screen reader / test tìm bằng nhãn "Chứng từ đính kèm".
 */
export function ImportFormFileField({ form, onUploadingChange }: Props) {
  const { t } = useTranslation(['importForms'])
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const setBusy = (busy: boolean) => {
    setUploading(busy)
    onUploadingChange(busy)
  }

  const onPick = async (file: File | undefined) => {
    if (!file) return
    form.clearErrors('file')
    if (file.size > FILE_MAX_BYTES) {
      form.setError('file', { type: 'server', message: 'importForms:fileTooLarge' })
      return
    }
    setBusy(true)
    try {
      const key = await uploadFile(file)
      form.setValue('file', key, { shouldDirty: true })
    } catch {
      form.setError('file', { type: 'server', message: 'importForms:fileUploadFailed' })
    } finally {
      setBusy(false)
      // Cho chọn lại đúng file đó sau khi lỗi / gỡ.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <FormField
      control={form.control}
      name="file"
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={inputId}>{t('importForms:fieldFile')}</FormLabel>
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            disabled={uploading}
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          {field.value !== '' ? (
            <div className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <FileIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={fileDisplayName(field.value)}>
                {fileDisplayName(field.value)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('importForms:fileRemove')}
                onClick={() => {
                  form.setValue('file', '', { shouldDirty: true })
                  form.clearErrors('file')
                }}
              >
                <XIcon aria-hidden />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <PaperclipIcon aria-hidden />
              )}
              {uploading ? t('importForms:fileUploading') : t('importForms:fileChoose')}
            </Button>
          )}
          <FormDescription>{t('importForms:fileHint')}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
