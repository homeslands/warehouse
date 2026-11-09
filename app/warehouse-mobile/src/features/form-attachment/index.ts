export {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  checkAttachment,
  type AttachmentProblem,
} from './model/check'
export {
  isAttachmentUploading,
  resetAttachmentUploads,
  startAttachmentUpload,
  useAttachmentUploading,
  type AttachmentKind,
  type UploadOutcome,
} from './model/upload.store'
export {
  useAttachmentField,
  type AttachmentField as AttachmentFieldState,
  type AttachmentFieldOptions,
} from './model/useAttachmentField'
export { AttachmentField } from './ui/AttachmentField'
