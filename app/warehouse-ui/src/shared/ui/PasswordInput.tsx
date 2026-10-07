import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/shared/ui/input-group'

type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'>

/**
 * Ô mật khẩu có icon mắt ẩn/hiện nằm TRONG ô, góc phải — pattern chung cho mọi form (màn login có bản kính
 * mờ riêng). Mọi prop (`id`, `aria-*`, `autoComplete`, `{...field}` của react-hook-form) đi thẳng vào thẻ
 * `<input>`, nên `FormControl` nối nhãn/lỗi như với `Input` thường. Mỗi ô tự giữ trạng thái hiện; đóng
 * dialog/sheet là unmount nên mở lại luôn về dạng ẩn.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const { t } = useTranslation(['auth'])
  const [visible, setVisible] = useState(false)

  return (
    // `h-9` = chiều cao của `Input` thường (InputGroup gốc là h-8) — cùng form không lệch hàng.
    <InputGroup className={cn('h-9', className)}>
      <InputGroupInput {...props} type={visible ? 'text' : 'password'} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? t('auth:hidePassword') : t('auth:showPassword')}
          aria-pressed={visible}
          onClick={() => setVisible((shown) => !shown)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
