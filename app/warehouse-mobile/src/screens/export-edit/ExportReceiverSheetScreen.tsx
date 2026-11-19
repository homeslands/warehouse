import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import { useRecentReceivers } from '@/entities/export-form'
import { useExportDraft } from '@/features/export-draft'
import { haptics } from '@/shared/lib/haptics'
import { normalizeForSearch } from '@/shared/lib/search'
import { useTheme } from '@/shared/theme/useTheme'
import { ChoiceCard, SearchField, SheetScaffold, Text } from '@/shared/ui'

import { RECEIVER_MAX, useReceiverWarehouses } from './ReceiverField'
import { receiverChoices, receiverKey } from './receiver-suggestions'
import { useExportHeaderSheet } from './useExportHeaderSheet'

/** Đang đánh dấu: một lựa chọn của danh sách, hoặc thẻ "Dùng “<chữ đang gõ>”" (đi theo chữ trong ô). */
type Mark = { kind: 'choice'; value: string } | { kind: 'typed' }

/**
 * Route `/export-receiver` — chọn Người nhận của phiếu xuất đang soạn (bước 1). Lựa chọn như trước
 * (`receiverChoices`): Chuyển kho = các kho trừ kho hiện tại; loại khác = người nhận gần đây của kho; giá
 * trị gõ tay đang có đứng đầu. Ô ghim trên cùng vừa LỌC danh sách (bỏ dấu) vừa NHẬP tên mới: chữ gõ không
 * trùng lựa chọn nào → thẻ "Dùng “…”" đứng đầu. `ChoiceCard` hai bước (chạm đánh dấu, ✓ ghi vào bản nháp);
 * phím Xong của bàn phím = đánh dấu chữ đang gõ (hoặc lựa chọn trùng tên) rồi áp dụng luôn. Đang ghi → ✓ khoá.
 */
export function ExportReceiverSheetScreen() {
  const { t } = useTranslation(['exportForms', 'common'])
  const { colors } = useTheme()
  const { header, saving, close, warehouseSlug } = useExportHeaderSheet()
  const warehouses = useReceiverWarehouses()
  const type = header?.type ?? 'PRODUCTION'
  const recent = useRecentReceivers(warehouseSlug, !!header && type !== 'TRANSFER')
  const current = header?.receiver ?? ''
  const [text, setText] = useState('')
  const [mark, setMark] = useState<Mark | null>(
    current === '' ? null : { kind: 'choice', value: current },
  )

  if (!header) return null

  const choices = receiverChoices(type, {
    warehouses,
    currentSlug: warehouseSlug,
    recent: recent.data ?? [],
    value: current,
  })
  const typed = text.trim()
  const term = normalizeForSearch(typed)
  const shown = choices.filter((c) => term === '' || normalizeForSearch(c.label).includes(term))
  const exact =
    typed === '' ? undefined : choices.find((c) => receiverKey(c.value) === receiverKey(typed))
  const showTyped = typed !== '' && !exact

  const markedValue = !mark ? '' : mark.kind === 'typed' ? (showTyped ? typed : '') : mark.value
  const isMarked = (value: string) =>
    mark?.kind === 'choice' && receiverKey(mark.value) === receiverKey(value)

  const choose = (next: Mark) => {
    haptics.selection()
    setMark(next)
  }
  const write = (value: string) => {
    const store = useExportDraft.getState()
    if (!store.draft || store.saving || value === '') return
    if (value !== store.draft.header.receiver) {
      store.setHeader({ receiver: value })
      haptics.success()
    }
    close()
  }
  const submitTyped = () => {
    if (typed === '' || saving) return
    write(exact ? exact.value : typed)
  }

  const loading = type !== 'TRANSFER' && recent.isLoading
  const hint = type === 'TRANSFER' ? 'receiverPicker.noWarehouses' : 'receiverPicker.noRecent'

  return (
    <SheetScaffold
      testID="export-receiver-sheet"
      title={t('exportForms:fields.receiver')}
      cancelLabel={t('common:close')}
      onCancel={close}
      doneLabel={t('common:done')}
      onDone={markedValue !== '' && !saving ? () => write(markedValue) : undefined}
      top={
        <SearchField
          value={text}
          onChangeText={setText}
          placeholder={t('exportForms:receiverPicker.search')}
          shape="pill"
          raised
          maxLength={RECEIVER_MAX}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={submitTyped}
        />
      }
    >
      <View style={{ gap: 8 }}>
        {showTyped ? (
          <ChoiceCard
            testID="export-receiver-typed"
            title={t('exportForms:receiverPicker.useTyped', { name: typed })}
            selected={mark?.kind === 'typed'}
            onPress={() => mark?.kind !== 'typed' && choose({ kind: 'typed' })}
          />
        ) : null}
        {shown.map((c) => (
          <ChoiceCard
            key={c.value}
            title={c.label}
            selected={isMarked(c.value)}
            onPress={() => !isMarked(c.value) && choose({ kind: 'choice', value: c.value })}
          />
        ))}
        {loading && shown.length === 0 ? (
          <ActivityIndicator color={colors.mutedForeground} />
        ) : choices.length === 0 && typed === '' ? (
          <Text muted size={13}>
            {t(`exportForms:${hint}`)}
          </Text>
        ) : null}
      </View>
    </SheetScaffold>
  )
}
