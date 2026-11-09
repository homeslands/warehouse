import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Linking, Platform } from 'react-native'

import { openableAttachmentUrl } from '@/shared/lib/attachment'
import { haptics } from '@/shared/lib/haptics'
import { chooseAction, confirmAction } from '@/shared/lib/native-confirm'

import {
  checkAttachment,
  documentUploadFile,
  DOCUMENT_MIME_TYPES,
  imageUploadFile,
  uploadErrorKey,
  type PickedFile,
} from './check'
import { startAttachmentUpload, useAttachmentUploading, type AttachmentKind } from './upload.store'

/**
 * Tuỳ chọn ảnh (chụp + thư viện): luôn ra JPEG, không HEIC.
 * - `quality` < 1: image-picker NÉN LẠI ảnh (iOS `UIImage.jpegData`, Android `Bitmap.compress(JPEG)`),
 *   không chép nguyên file gốc.
 * - `preferredAssetRepresentationMode: Compatible` (iOS 14+, PHPicker): thư viện trả bản "tương thích
 *   nhất" — ảnh HEIC được hệ thống chuyển sang JPEG trước khi image-picker đọc; mặc định native của
 *   SDK 58 là `current` (giữ HEIC → file `.heic`).
 * - Không `allowsEditing` (không cắt ảnh).
 */
const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  allowsEditing: false,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
}

type Source = 'camera' | 'library' | 'document'
type Choice = Source | 'view' | 'remove' | 'replace'
const SOURCES: readonly Source[] = ['camera', 'library', 'document']

export type AttachmentFieldOptions = {
  kind: AttachmentKind
  warehouseSlug: string | undefined
  /** `header.file` của bản nháp (URL, hoặc khoá cũ web lưu, hoặc `null`). */
  value: string | null
  /** Ghi `header.file` (URL vừa tải lên, hoặc `null` khi gỡ). */
  onChange: (file: string | null) => void
  /**
   * Khoá của bản nháp đang mở (`null` = chưa / không có bản nháp). Đọc lúc bắt đầu tải và lúc tải xong:
   * khác nhau → kết quả bị bỏ (đã bỏ nháp, rời luồng, đổi phiếu).
   */
  getFormKey: () => string | null
  /** Cùng `disabled` của các ô đầu phiếu (đang ghi phiếu). */
  disabled: boolean
}

export type AttachmentField = {
  /** Đang có chứng từ của loại phiếu này tải lên (dòng hiện vòng quay, không bấm được). */
  uploading: boolean
  /** Câu báo lỗi của lần chọn / tải gần nhất (hiện dưới dòng); mất khi mở lại bảng chọn. */
  error: string | null
  /** Mở bảng chọn (spec §5) → chọn → kiểm → tải lên. */
  open: () => void
}

/**
 * Dòng "Chứng từ" của bước 1 form soạn phiếu: bảng chọn nguồn (Chụp ảnh / Thư viện / Chọn tệp, khi đã
 * có file thêm Xem / Gỡ), kiểm trước khi tải (`checkAttachment`), tải lên NGOÀI vòng đời màn
 * (`startAttachmentUpload`, cờ đang tải dùng chung với bước Lưu). Tải xong chỉ gắn vào bản nháp nếu
 * `getFormKey()` còn như lúc bắt đầu.
 *
 * Android: `chooseAction` chỉ chứa 3 nút → đã có file thì bảng đầu là [Thay chứng từ, Xem, Gỡ], "Thay"
 * mở bảng 3 nguồn. iOS: một bảng đủ mục.
 */
export function useAttachmentField({
  kind,
  warehouseSlug,
  value,
  onChange,
  getFormKey,
  disabled,
}: AttachmentFieldOptions): AttachmentField {
  const { t } = useTranslation('common')
  const uploading = useAttachmentUploading(kind)
  const [error, setError] = useState<string | null>(null)
  /** Đang mở bảng chọn / bộ chọn hệ thống: bấm lại không mở thêm. */
  const picking = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const report = (message: string) => {
    haptics.error()
    if (mounted.current) setError(message)
  }

  const fromCamera = async (): Promise<PickedFile | null> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      haptics.error()
      Alert.alert(
        t('attachment.cameraDenied'),
        undefined,
        permission.canAskAgain
          ? [{ text: t('close'), style: 'cancel' }]
          : [
              { text: t('close'), style: 'cancel' },
              { text: t('attachment.openSettings'), onPress: () => void Linking.openSettings() },
            ],
      )
      return null
    }
    const result = await ImagePicker.launchCameraAsync(IMAGE_OPTIONS)
    const asset = result.canceled ? undefined : result.assets[0]
    return asset ? imageUploadFile(asset) : null
  }

  const fromLibrary = async (): Promise<PickedFile | null> => {
    const result = await ImagePicker.launchImageLibraryAsync(IMAGE_OPTIONS)
    const asset = result.canceled ? undefined : result.assets[0]
    return asset ? imageUploadFile(asset) : null
  }

  const fromDocument = async (): Promise<PickedFile | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      // Android: nhiều nhà cung cấp tệp báo `octet-stream`; `documentUploadFile` suy MIME từ đuôi tên.
      type:
        Platform.OS === 'android'
          ? [...DOCUMENT_MIME_TYPES, 'application/octet-stream']
          : [...DOCUMENT_MIME_TYPES],
      copyToCacheDirectory: true,
    })
    const asset = result.canceled ? undefined : result.assets[0]
    return asset ? documentUploadFile(asset) : null
  }

  const upload = async (picked: PickedFile) => {
    const problem = checkAttachment(picked)
    if (problem) {
      report(t(`attachment.${problem}`))
      return
    }
    const formKey = getFormKey()
    if (!formKey || !warehouseSlug || !picked.mimeType) return
    const outcome = await startAttachmentUpload({
      kind,
      warehouseSlug,
      formKey,
      file: { uri: picked.uri, name: picked.name, mimeType: picked.mimeType },
      getFormKey,
      onDone: (url) => onChange(url),
    })
    if (outcome.status === 'done') haptics.success()
    else if (outcome.status === 'error') report(t(`attachment.${uploadErrorKey(outcome.error)}`))
  }

  const ask = async (choices: readonly Choice[]): Promise<Choice | null> => {
    const index = await chooseAction({
      title: t('attachment.title'),
      actions: choices.map((c) => ({ label: t(`attachment.${c}`), destructive: c === 'remove' })),
      cancelLabel: t('cancel'),
    })
    return index === null ? null : (choices[index] ?? null)
  }

  const run = async () => {
    const viewUrl = value ? openableAttachmentUrl(value) : null
    const extra: Choice[] = [
      ...(viewUrl ? (['view'] as const) : []),
      ...(value ? (['remove'] as const) : []),
    ]
    let choice: Choice | null
    if (Platform.OS === 'android' && value) {
      choice = await ask(['replace', ...extra])
      if (choice === 'replace') choice = await ask(SOURCES)
    } else {
      choice = await ask([...SOURCES, ...extra])
    }
    if (choice === null || choice === 'replace') return
    if (choice === 'view') {
      if (viewUrl) Linking.openURL(viewUrl).catch(() => report(t('attachment.openFailed')))
      return
    }
    if (choice === 'remove') {
      const ok = await confirmAction({
        title: t('attachment.removeTitle'),
        confirmLabel: t('attachment.removeConfirm'),
        cancelLabel: t('attachment.removeKeep'),
        destructive: true,
      })
      if (ok) onChange(null)
      return
    }
    const picked =
      choice === 'camera'
        ? await fromCamera()
        : choice === 'library'
          ? await fromLibrary()
          : await fromDocument()
    picking.current = false
    if (picked) await upload(picked)
  }

  const open = () => {
    if (disabled || uploading || picking.current) return
    picking.current = true
    setError(null)
    run()
      .catch(() => report(t('attachment.uploadFailed')))
      .finally(() => {
        picking.current = false
      })
  }

  return { uploading, error, open }
}
