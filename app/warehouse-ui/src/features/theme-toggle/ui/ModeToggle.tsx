import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

export function ModeToggle() {
  const { setTheme } = useTheme()
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('theme')}>
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      {/* Cùng số đo với `LanguageToggle` — xem ghi chú ở đó. */}
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-48 p-1.5">
        <DropdownMenuItem className="gap-3 px-3 py-2" onClick={() => setTheme('light')}>
          <Sun className="size-4" />
          {t('themeLight')}
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-3 px-3 py-2" onClick={() => setTheme('dark')}>
          <Moon className="size-4" />
          {t('themeDark')}
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-3 px-3 py-2" onClick={() => setTheme('system')}>
          <Monitor className="size-4" />
          {t('themeSystem')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
