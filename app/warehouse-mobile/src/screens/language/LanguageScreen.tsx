import { LanguageSheet } from '@/features/language-switch'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'

/** Route `/language`: sheet chọn ngôn ngữ — mở từ màn đăng nhập (chưa đăng nhập) hoặc Tài khoản. */
export function LanguageScreen() {
  const close = useCloseSheet()
  return <LanguageSheet onClose={close} />
}
