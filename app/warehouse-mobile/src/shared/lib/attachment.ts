/**
 * Hậu tố backend gắn vào tên file ngay trước đuôi: `-<13 chữ số>` (timestamp ms, BE cũ) hoặc
 * `-<UUID>` (BE từ 2026-11-05, `buildObjectKey`).
 */
const KEY_SUFFIX =
  /-(?:\d{13}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=\.[^./]*$|$)/i

function lastSegment(value: string): string {
  const path = value.split('#')[0]!.split('?')[0]!
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Tên hiển thị của chứng từ từ URL / khoá S3: đoạn cuối, bỏ query, giải mã %, bỏ hậu tố `-<13 số>` / `-<UUID>` trước đuôi. */
export function attachmentName(value: string): string {
  let name = lastSegment(value)
  try {
    name = decodeURIComponent(name)
  } catch {
    // %-escape hỏng: giữ nguyên.
  }
  return name.replace(KEY_SUFFIX, '')
}

export function isImageAttachment(value: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(lastSegment(value))
}

/** Chỉ http(s) mới mở được; khoá S3 trần hay scheme lạ (`javascript:`) → `null`. */
export function openableAttachmentUrl(value: string): string | null {
  return value.startsWith('https://') || value.startsWith('http://') ? value : null
}
