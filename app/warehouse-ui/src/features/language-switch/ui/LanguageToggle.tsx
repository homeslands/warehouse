import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { SUPPORTED_LANGUAGES } from '@/shared/i18n'
import { FlagIcon } from './FlagIcon'

const LABEL_KEY = { vi: 'languageVi', en: 'languageEn' } as const

export function LanguageToggle() {
  const { t, i18n } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('language')}>
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      {/* Rộng và thoáng hơn mặc định của `dropdown-menu` (min 8rem, p-1) — chỉnh TẠI ĐÂY, không ở
          component chung, để menu thao tác trên từng dòng bảng giữ nguyên. Cùng số đo với
          `ModeToggle` để hai menu cạnh nhau trông như một bộ. */}
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-48 p-1.5">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <DropdownMenuItem
            key={lng}
            className="gap-3 px-3 py-2"
            onClick={() => void i18n.changeLanguage(lng)}
          >
            <FlagIcon lang={lng} />
            {t(LABEL_KEY[lng])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
