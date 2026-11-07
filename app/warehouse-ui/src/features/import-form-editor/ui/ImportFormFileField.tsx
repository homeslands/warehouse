import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { fileDisplayName, uploadFile } from '@/shared/api/file.api'
import { FileUploadField } from '@/shared/ui/FileUploadField'
import type { ImportFormValues } from '../model/import-form-editor.schema'

type Props = {
  form: UseFormReturn<ImportFormValues>
  /** Trang khoá nút Lưu khi đang tải lên. */
  onUploadingChange: (uploading: boolean) => void
}

const MESSAGES = {
  tooLarge: 'importForms:fileTooLarge',
  failed: 'importForms:fileUploadFailed',
}

/** Ô "Chứng từ đính kèm" của phiếu nhập — bọc mỏng quanh `FileUploadField`. */
export function ImportFormFileField({ form, onUploadingChange }: Props) {
  const { t } = useTranslation('importForms')
  return (
    <FileUploadField
      form={form}
      name="file"
      label={t('fieldFile')}
      upload={uploadFile}
      displayName={fileDisplayName}
      onUploadingChange={onUploadingChange}
      messages={MESSAGES}
    />
  )
}
