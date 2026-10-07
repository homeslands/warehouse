import { useId } from 'react'
import { Trans } from 'react-i18next'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

type Props = {
  /** Chữ người dùng phải gõ đúng (vd tên đăng nhập của người bị tác động). */
  phrase: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * Ô "Nhập <X> để xác nhận" cho hành động khó đảo ngược. Chỉ lo phần hiển thị + nhập; bên gọi tự khoá nút xác
 * nhận bằng `isPhraseConfirmed` (`shared/lib/confirm-phrase.ts`). Nhãn nối với ô bằng `htmlFor`, nên tên khả
 * truy cập của ô chính là câu hướng dẫn.
 */
export function ConfirmPhraseField({ phrase, value, onChange, disabled }: Props) {
  const id = useId()

  return (
    <div className="space-y-2 text-left">
      <Label htmlFor={id} className="block leading-relaxed font-normal">
        <Trans
          ns={['common']}
          i18nKey="common:typeToConfirm"
          values={{ phrase }}
          components={[<span key="0" />, <span key="1" className="font-mono font-semibold" />]}
        />
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  )
}
