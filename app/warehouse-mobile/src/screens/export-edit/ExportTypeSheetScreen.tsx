import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { EXPORT_FORM_TYPES, type ExportFormType } from '@/entities/export-form'
import { useExportDraft } from '@/features/export-draft'
import { haptics } from '@/shared/lib/haptics'
import { ChoiceCard, SheetScaffold } from '@/shared/ui'

import { useReceiverWarehouses } from './ReceiverField'
import { isReceiverValidFor } from './receiver-suggestions'
import { useExportHeaderSheet } from './useExportHeaderSheet'

/**
 * Route `/export-type` — chọn Loại của phiếu xuất đang soạn (bước 1). `ChoiceCard` hai bước: chạm chỉ đánh
 * dấu, ✓ mới ghi vào bản nháp. Đổi "kiểu" (Chuyển kho ↔ loại khác) mà người nhận không còn hợp lệ → xoá
 * người nhận để buộc chọn lại (`isReceiverValidFor`). Chọn đúng loại hiện tại → ✓ chỉ đóng. Đang ghi → ✓ khoá.
 */
export function ExportTypeSheetScreen() {
  const { t } = useTranslation(['exportForms', 'common'])
  const { header, saving, close } = useExportHeaderSheet()
  const warehouses = useReceiverWarehouses()
  const [marked, setMarked] = useState<ExportFormType | null>(header?.type ?? null)

  if (!header) return null

  const apply = () => {
    const d = useExportDraft.getState().draft
    if (!d || useExportDraft.getState().saving || !marked) return
    const prev = d.header.type
    if (marked !== prev) {
      const receiver = d.header.receiver
      const stale = receiver !== '' && !isReceiverValidFor(prev, marked, receiver, warehouses)
      useExportDraft.getState().setHeader(stale ? { type: marked, receiver: '' } : { type: marked })
      haptics.success()
    }
    close()
  }

  return (
    <SheetScaffold
      testID="export-type-sheet"
      title={t('exportForms:fields.type')}
      cancelLabel={t('common:close')}
      onCancel={close}
      doneLabel={t('common:done')}
      onDone={marked && !saving ? apply : undefined}
    >
      <View style={{ gap: 8 }}>
        {EXPORT_FORM_TYPES.map((type) => (
          <ChoiceCard
            key={type}
            title={t(`exportForms:type.${type}`)}
            selected={marked === type}
            onPress={() => {
              if (marked === type) return
              haptics.selection()
              setMarked(type)
            }}
          />
        ))}
      </View>
    </SheetScaffold>
  )
}
