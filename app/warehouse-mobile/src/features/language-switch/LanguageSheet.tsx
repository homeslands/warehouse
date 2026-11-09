import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, View } from 'react-native'

import { errorMessage } from '@/shared/api/error-message'
import { SUPPORTED_LANGUAGES, changeLanguage, type SupportedLanguage } from '@/shared/i18n'
import { haptics } from '@/shared/lib/haptics'
import { useSheetSubmit } from '@/shared/lib/useSheetSubmit'
import { ChoiceCard, SectionHeader, SheetScaffold } from '@/shared/ui'

import { LANGUAGE_LABEL_KEY, useCurrentLanguage } from './useCurrentLanguage'

/** Tên ngôn ngữ còn lại, cố định ở mọi giao diện ("Tiếng Việt · Vietnamese", "English · Tiếng Anh"). */
const ALT_NAME_KEY = { vi: 'common:languageViAlt', en: 'common:languageEnAlt' } as const

export type LanguageSheetProps = {
  /** Đóng sheet (route `/language` → `router.back()`). */
  onClose: () => void
}

/**
 * Sheet chọn ngôn ngữ (dùng được cả khi chưa đăng nhập): chạm thẻ chỉ đánh dấu (rung chọn), ✓ áp
 * dụng `changeLanguage` (lưu lựa chọn, mọi màn render lại) rồi dấu tích nảy và đóng; chọn đúng ngôn
 * ngữ đang dùng thì ✓ đóng ngay; ✕ đóng không đổi.
 */
export function LanguageSheet({ onClose }: LanguageSheetProps) {
  const { t } = useTranslation(['common', 'errors'])
  const { current } = useCurrentLanguage()
  const [marked, setMarked] = useState<SupportedLanguage>(current)
  const { doneState, submit } = useSheetSubmit({
    onSubmit: () => changeLanguage(marked),
    onClose,
    onError: (e) => Alert.alert(t('common:language'), errorMessage(e, t)),
  })

  const mark = (lng: SupportedLanguage) => {
    if (doneState !== 'idle' || lng === marked) return
    haptics.selection()
    setMarked(lng)
  }

  return (
    <SheetScaffold
      testID="language-sheet"
      title={t('common:language')}
      cancelLabel={t('common:cancel')}
      doneLabel={t('common:done')}
      onCancel={onClose}
      onDone={() => (marked === current ? onClose() : void submit())}
      doneState={doneState}
    >
      <SectionHeader variant="sentence">{t('common:appLanguage')}</SectionHeader>
      <View style={{ gap: 8 }}>
        {SUPPORTED_LANGUAGES.map((lng) => (
          <ChoiceCard
            key={lng}
            testID={`language-card-${lng}`}
            title={t(LANGUAGE_LABEL_KEY[lng])}
            subtitle={t(ALT_NAME_KEY[lng])}
            leading={{ text: lng.toUpperCase() }}
            selected={lng === marked}
            onPress={() => mark(lng)}
          />
        ))}
      </View>
    </SheetScaffold>
  )
}
