import { useCallback } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { fileDisplayName } from '@/shared/api/file.api'
import { FileUploadField } from '@/shared/ui/FileUploadField'
import { uploadExportFormFile } from '@/entities/export-form'
import type { ExportFormValues } from '../model/export-form-editor.schema'

type Props = {
  form: UseFormReturn<ExportFormValues>
  warehouseSlug: string
  onUploadingChange: (uploading: boolean) => void
}

const MESSAGES = {
  tooLarge: 'exportForms:fileTooLarge',
  failed: 'exportForms:fileUploadFailed',
}

/** Link S3 → tên file dễ đọc: đoạn cuối của đường dẫn, bỏ hậu tố thời gian. */
const displayName = (value: string) => fileDisplayName(value.split('/').pop() ?? value)

/** Ô "Chứng từ đính kèm" của phiếu xuất — bọc mỏng quanh `FileUploadField`. */
export function ExportFormFileField({ form, warehouseSlug, onUploadingChange }: Props) {
  const { t } = useTranslation('exportForms')
  const upload = useCallback(
    (file: File) => uploadExportFormFile(warehouseSlug, file),
    [warehouseSlug],
  )
  return (
    <FileUploadField
      form={form}
      name="file"
      label={t('fieldFile')}
      upload={upload}
      displayName={displayName}
      onUploadingChange={onUploadingChange}
      messages={MESSAGES}
    />
  )
}
