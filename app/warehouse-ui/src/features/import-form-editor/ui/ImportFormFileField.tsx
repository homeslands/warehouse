import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import {
  FILE_UPLOAD_ACCEPT,
  fileDisplayName,
  isAllowedUploadFile,
  uploadErrorKind,
  uploadFile,
  type UploadErrorKind,
} from '@/shared/api/file.api'
import { FileUploadField } from '@/shared/ui/FileUploadField'
import type { ImportFormValues } from '../model/import-form-editor.schema'

type Props = {
  form: UseFormReturn<ImportFormValues>
  /** Trang khoá nút Lưu khi đang tải lên. */
  onUploadingChange: (uploading: boolean) => void
  /**
   * Có `FILE_CREATE` (`POST /file/upload`). Thiếu thì khoá nút chọn file + nói lý do; file đã gắn vẫn hiện / gỡ
   * được. Backend vẫn là chốt chặn (403).
   */
  canUpload: boolean
}

const MESSAGES = {
  tooLarge: 'importForms:fileTooLarge',
  failed: 'importForms:fileUploadFailed',
}

/** Lỗi `POST /file/upload` → câu tại ô (BE #168: 121012 / 121001 / 121000 / 403). */
const UPLOAD_ERROR_MESSAGES: Record<UploadErrorKind, string> = {
  typeNotAllowed: 'importForms:fileTypeNotAllowed',
  tooLarge: 'importForms:fileTooLarge',
  missing: 'importForms:fileMissing',
  forbidden: 'importForms:fileUploadForbidden',
  failed: 'importForms:fileUploadFailed',
}

const validate = (file: File) =>
  isAllowedUploadFile(file) ? undefined : UPLOAD_ERROR_MESSAGES.typeNotAllowed

const uploadErrorMessage = (error: unknown) => UPLOAD_ERROR_MESSAGES[uploadErrorKind(error)]

/** Ô "Chứng từ đính kèm" của phiếu nhập — bọc mỏng quanh `FileUploadField`, gọi `POST /file/upload`. */
export function ImportFormFileField({ form, onUploadingChange, canUpload }: Props) {
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
      accept={FILE_UPLOAD_ACCEPT}
      validate={validate}
      uploadErrorMessage={uploadErrorMessage}
      hint={t('fileHint')}
      disabledReason={canUpload ? undefined : t('fileUploadNoPermission')}
    />
  )
}
