import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, View } from 'react-native'

import { errorMessage } from '@/shared/api/error-message'
import { haptics } from '@/shared/lib/haptics'
import { useSheetSubmit } from '@/shared/lib/useSheetSubmit'
import { APPEARANCES, setAppearance, type AppearancePreference } from '@/shared/theme/appearance'
import { ChoiceCard, SectionHeader, SheetScaffold } from '@/shared/ui'
import { Moon, Sun, SunMoon, type LucideIcon } from '@/shared/ui/icons'

import { APPEARANCE_LABEL_KEY, useCurrentAppearance } from './useCurrentAppearance'

const HINT_KEY = {
  system: 'common:appearanceSystemHint',
  light: 'common:appearanceLightHint',
  dark: 'common:appearanceDarkHint',
} as const

const ICON: Record<AppearancePreference, LucideIcon> = { system: SunMoon, light: Sun, dark: Moon }

export type AppearanceSheetProps = {
  /** Đóng sheet (route `/appearance` → `router.back()`). */
  onClose: () => void
}

/**
 * Sheet chọn giao diện Theo hệ thống / Sáng / Tối (như sheet Ngôn ngữ): chạm thẻ chỉ đánh dấu (rung
 * chọn), ✓ áp dụng `setAppearance` (ghi đè native + lưu trên máy, mọi màn đổi màu) rồi dấu tích nảy và
 * đóng; chọn đúng lựa chọn đang dùng thì ✓ đóng ngay; ✕ đóng không đổi.
 */
export function AppearanceSheet({ onClose }: AppearanceSheetProps) {
  const { t } = useTranslation(['common', 'errors'])
  const { current } = useCurrentAppearance()
  const [marked, setMarked] = useState<AppearancePreference>(current)
  const { doneState, submit } = useSheetSubmit({
    onSubmit: () => setAppearance(marked),
    onClose,
    onError: (e) => Alert.alert(t('common:appearance'), errorMessage(e, t)),
  })

  const mark = (value: AppearancePreference) => {
    if (doneState !== 'idle' || value === marked) return
    haptics.selection()
    setMarked(value)
  }

  return (
    <SheetScaffold
      testID="appearance-sheet"
      title={t('common:appearance')}
      cancelLabel={t('common:cancel')}
      doneLabel={t('common:done')}
      onCancel={onClose}
      onDone={() => (marked === current ? onClose() : void submit())}
      doneState={doneState}
    >
      <SectionHeader variant="sentence">{t('common:appAppearance')}</SectionHeader>
      <View style={{ gap: 8 }}>
        {APPEARANCES.map((value) => (
          <ChoiceCard
            key={value}
            testID={`appearance-card-${value}`}
            title={t(APPEARANCE_LABEL_KEY[value])}
            subtitle={t(HINT_KEY[value])}
            leading={{ icon: ICON[value] }}
            selected={value === marked}
            onPress={() => mark(value)}
          />
        ))}
      </View>
    </SheetScaffold>
  )
}
