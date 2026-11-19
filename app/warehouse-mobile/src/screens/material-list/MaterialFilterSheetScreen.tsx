import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { materialAbilities } from '@/entities/material'
import { useMaterialTypes } from '@/entities/material-type'
import { useAuthStore } from '@/entities/session'
import { haptics } from '@/shared/lib/haptics'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { errorMessage } from '@/shared/api/error-message'
import { ChoiceCard, FirstLoadState, SheetScaffold } from '@/shared/ui'
import { Layers, Tag } from '@/shared/ui/icons'

import { useMaterialFilter } from './filter-store'

/**
 * Route `/material-filter`: lọc danh sách Vật tư theo loại. Một chạm = chọn và đóng ("Tất cả loại" +
 * từng loại, dấu chọn ở mục đang lọc). Loại lấy từ `useMaterialTypes` (danh mục dùng chung mọi kho).
 */
export function MaterialFilterSheetScreen() {
  const { t } = useTranslation(['catalog', 'common', 'errors'])
  const close = useCloseSheet()
  const user = useAuthStore((s) => s.user)
  const types = useMaterialTypes({ enabled: materialAbilities(user).read })
  const data = types.data
  const current = useMaterialFilter((s) => s.type)

  const pick = (type: { slug: string; code: string; name: string } | null) => {
    haptics.selection()
    useMaterialFilter.getState().setType(type)
    close()
  }

  return (
    <SheetScaffold
      testID="material-filter-sheet"
      title={t('catalog:material.filterTitle')}
      cancelLabel={t('common:cancel')}
      onCancel={close}
    >
      {!data ? (
        <FirstLoadState
          failed={types.isError}
          errorTitle={t('catalog:loadError')}
          errorMessage={errorMessage(types.error, t)}
          loadingLabel={t('catalog:loading')}
          fetching={types.isFetching}
          onRetry={() => void types.refetch({ cancelRefetch: false })}
        />
      ) : (
        <View style={{ gap: 8 }}>
          <ChoiceCard
            title={t('catalog:material.filterAll')}
            leading={{ icon: Layers }}
            selected={current === null}
            onPress={() => pick(null)}
          />
          {data.map((ty) => (
            <ChoiceCard
              key={ty.slug}
              title={ty.name}
              subtitle={ty.code}
              leading={{ icon: Tag }}
              selected={current?.slug === ty.slug}
              onPress={() => pick({ slug: ty.slug, code: ty.code, name: ty.name })}
            />
          ))}
        </View>
      )}
    </SheetScaffold>
  )
}
