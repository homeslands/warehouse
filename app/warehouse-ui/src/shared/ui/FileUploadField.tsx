import { FileIcon, Loader2Icon, PaperclipIcon, XIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FieldPath, FieldPathValue, FieldValues, UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { FILE_MAX_BYTES } from '@/shared/api/file.api'
import { Button } from '@/shared/ui/button'
import { IconTooltip } from '@/shared/ui/IconTooltip'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form'

type Props<T extends FieldValues> = {
  form: UseFormReturn<T>
  /** Ô chuỗi trong form giữ `key` của file đã tải lên (`''` = chưa có). */
  name: FieldPath<T>
  label: string
  /** Tải file lên, trả về `key` để lưu vào form. */
  upload: (file: File) => Promise<string>
  /** Tên dễ đọc của `key` để hiện cạnh icon file. */
  displayName: (value: string) => string
  /** Trang khoá nút Lưu khi đang tải lên. */
  onUploadingChange: (uploading: boolean) => void
  /** Khoá i18n có namespace của hai lỗi — `FormMessage` tự dịch. */
  messages: { tooLarge: string; failed: string }
  /** `accept` của `<input type="file">` — chỉ lọc gợi ý trong hộp chọn file; kiểm thật ở `validate`. */
  accept?: string
  /** Kiểm file phía client sau bước kích thước; trả khoá i18n của lỗi, `undefined` = hợp lệ (vẫn upload). */
  validate?: (file: File) => string | undefined
  /** Lỗi của `upload` → khoá i18n hiện tại ô. Không truyền = luôn `messages.failed`. */
  uploadErrorMessage?: (error: unknown) => string
  /** Dòng gợi ý dưới ô; mặc định `common:fileHint`. */
  hint?: string
  /**
   * Có giá trị = không được tải file mới (vd thiếu quyền): nút chọn file bị khoá và câu này thay dòng gợi ý.
   * File đã gắn vẫn hiện và gỡ được (gỡ là sửa phiếu, không phải upload).
   */
  disabledReason?: string
}

/**
 * Chọn file là tải lên ngay; form chỉ giữ `key`. Không có link tải về — backend chưa có endpoint (nợ kỹ thuật).
 * `<input type="file">` ẩn, nối nhãn qua `id` để screen reader / test tìm bằng nhãn.
 */
export function FileUploadField<T extends FieldValues>({
  form,
  name,
  label,
  upload,
  displayName,
  onUploadingChange,
  messages,
  accept,
  validate,
  uploadErrorMessage,
  hint,
  disabledReason,
}: Props<T>) {
  const { t } = useTranslation('common')
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const locked = disabledReason !== undefined
  const empty = '' as FieldPathValue<T, FieldPath<T>>

  const setBusy = (busy: boolean) => {
    setUploading(busy)
    onUploadingChange(busy)
  }

  const onPick = async (file: File | undefined) => {
    if (!file || locked) return
    form.clearErrors(name)
    const resetInput = () => {
      // Cho chọn lại đúng file đó sau khi lỗi / gỡ.
      if (inputRef.current) inputRef.current.value = ''
    }
    if (file.size > FILE_MAX_BYTES) {
      form.setError(name, { type: 'server', message: messages.tooLarge })
      resetInput()
      return
    }
    const invalid = validate?.(file)
    if (invalid !== undefined) {
      form.setError(name, { type: 'server', message: invalid })
      resetInput()
      return
    }
    setBusy(true)
    try {
      const key = await upload(file)
      form.setValue(name, key as FieldPathValue<T, FieldPath<T>>, { shouldDirty: true })
    } catch (error) {
      form.setError(name, {
        type: 'server',
        message: uploadErrorMessage?.(error) ?? messages.failed,
      })
    } finally {
      setBusy(false)
      resetInput()
    }
  }

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={inputId}>{label}</FormLabel>
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            accept={accept}
            disabled={uploading || locked}
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          {field.value !== '' ? (
            <div className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <FileIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={displayName(field.value as string)}>
                {displayName(field.value as string)}
              </span>
              <IconTooltip label={t('fileRemove')}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('fileRemove')}
                  onClick={() => {
                    form.setValue(name, empty, { shouldDirty: true })
                    form.clearErrors(name)
                  }}
                >
                  <XIcon aria-hidden />
                </Button>
              </IconTooltip>
            </div>
          ) : (
            // `FormControl`: nút là chỗ người dùng focus (input thật bị ẩn) → gắn `aria-describedby` tới gợi ý /
            // lý do khoá / câu lỗi và `aria-invalid` để screen reader đọc kèm.
            <FormControl>
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                disabled={uploading || locked}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2Icon className="animate-spin" aria-hidden />
                ) : (
                  <PaperclipIcon aria-hidden />
                )}
                {uploading ? t('fileUploading') : t('fileChoose')}
              </Button>
            </FormControl>
          )}
          <FormDescription>{disabledReason ?? hint ?? t('fileHint')}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
