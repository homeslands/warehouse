import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import { useSuppliers } from '@/entities/import-form'
import { can, useAuthStore } from '@/entities/session'
import { restampSupplier, useReceiveDraft } from '@/features/receive-checklist'
import { haptics } from '@/shared/lib/haptics'
import { normalizeForSearch } from '@/shared/lib/search'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useTheme } from '@/shared/theme/useTheme'
import { Button, ChoiceCard, SearchField, SheetScaffold, Text } from '@/shared/ui'

/**
 * Route `/import-supplier` — chọn Bên bán của phiếu nhập MỚI đang soạn (phiếu đã có trên server: bên
 * bán chỉ đọc, sheet tự đóng). Ô tìm trên máy (tên / mã, bỏ dấu); hai bước như `ChoiceCard` ở mọi
 * sheet: chạm chỉ đánh dấu, ✓ mới áp dụng — đặt bên bán đầu phiếu và ghi lại bên bán lên mọi dòng
 * (`restampSupplier`: một phiếu một bên bán). Chọn đúng giá trị hiện tại thì ✓ chỉ đóng.
 */
export function ImportSupplierSheetScreen() {
  const { t } = useTranslation(['importForms', 'common'])
  const { colors } = useTheme()
  const close = useCloseSheet()

  const draft = useReceiveDraft((s) => s.draft)
  const saving = useReceiveDraft((s) => s.saving)
  const user = useAuthStore((s) => s.user)
  const canPick = !!user && can(user, 'SUPPLIER_READ')
  const suppliers = useSuppliers(canPick)

  // Chỉ phiếu mới có bên bán sửa được; không còn bản nháp / thiếu quyền xem bên bán → không có gì để làm.
  const gone = !draft || draft.formSlug !== 'new' || !canPick
  useEffect(() => {
    if (gone) close()
    // `close` đổi định danh mỗi lần render; chỉ phản ứng khi điều kiện đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone])

  const current = draft?.header.supplierSlug ?? null
  const [text, setText] = useState('')
  // Đang đánh dấu; chưa chạm gì thì là bên bán hiện tại.
  const [marked, setMarked] = useState<string | null>(current)
  const term = normalizeForSearch(text.trim())

  const all = suppliers.data
  const shown = useMemo(
    () =>
      (all ?? []).filter(
        (s) =>
          term === '' ||
          normalizeForSearch(s.name).includes(term) ||
          normalizeForSearch(s.code).includes(term),
      ),
    [all, term],
  )

  const apply = () => {
    const store = useReceiveDraft.getState()
    const d = store.draft
    if (!d || store.saving || !marked) return
    const picked = all?.find((s) => s.slug === marked)
    if (picked && picked.slug !== d.header.supplierSlug) {
      store.replace(restampSupplier(d, { slug: picked.slug, name: picked.name }))
      haptics.success()
    }
    close()
  }

  if (gone) return null

  return (
    <SheetScaffold
      testID="import-supplier-sheet"
      title={t('importForms:supplierSheet.title')}
      cancelLabel={t('common:close')}
      onCancel={close}
      doneLabel={t('common:done')}
      onDone={marked && !saving ? apply : undefined}
    >
      <View style={{ gap: 12 }}>
        <SearchField
          value={text}
          onChangeText={setText}
          placeholder={t('importForms:supplierSheet.search')}
          shape="pill"
        />
        {suppliers.isError && !all ? (
          <View style={{ gap: 8, alignItems: 'flex-start' }}>
            <Text muted size={13}>
              {t('importForms:create.supplierLoadError')}
            </Text>
            <Button
              variant="outline"
              loading={suppliers.isFetching}
              onPress={() => void suppliers.refetch({ cancelRefetch: false })}
            >
              {t('common:retry')}
            </Button>
          </View>
        ) : !all ? (
          <ActivityIndicator color={colors.mutedForeground} />
        ) : all.length === 0 ? (
          <Text muted size={13}>
            {t('importForms:create.supplierEmpty')}
          </Text>
        ) : shown.length === 0 ? (
          <Text muted style={{ textAlign: 'center', paddingTop: 16 }}>
            {t('importForms:supplierSheet.empty')}
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {shown.map((s) => (
              <ChoiceCard
                key={s.slug}
                title={s.name}
                subtitle={
                  <Text code muted size={13} numberOfLines={1}>
                    {s.code}
                  </Text>
                }
                selected={marked === s.slug}
                onPress={() => {
                  if (marked === s.slug) return
                  haptics.selection()
                  setMarked(s.slug)
                }}
              />
            ))}
          </View>
        )}
      </View>
    </SheetScaffold>
  )
}
