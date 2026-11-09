import { History, Warehouse } from '@/shared/ui/icons'
import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Pressable,
  StyleSheet,
  View,
  type TextInputInstance,
  type ViewInstance,
} from 'react-native'

import { useRecentReceivers, type ExportFormType } from '@/entities/export-form'
import { useAuthStore, type UserWarehouse } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { haptics } from '@/shared/lib/haptics'
import { useRevealInput } from '@/shared/lib/keyboard'
import { useTheme } from '@/shared/theme/useTheme'
import { FormInfoRow, ROW_PRESS_DELAY_MS, Text } from '@/shared/ui'

import { receiverSuggestions, type ReceiverSuggestion } from './receiver-suggestions'

/** `EXPORT_FORM_RECEIVER_MAX_LENGTH`. */
export const RECEIVER_MAX = 255

const NO_WAREHOUSES: UserWarehouse[] = []

/**
 * Dòng Người nhận của nhóm Thông tin (màn soạn phiếu xuất): `FormInfoRow` kiểu `input` (chữ tự do ≤ 255
 * như backend, bắt buộc) + gợi ý khi đang nhập, hiện NGAY DƯỚI dòng trong cùng nhóm: người nhận gần
 * đây của kho (`useRecentReceivers` — chỉ tải sau lần focus đầu) và, với loại Chuyển kho, các kho chọn
 * được trừ kho hiện tại (ADMIN+: danh sách mọi kho trong store kho; còn lại: kho của mình — cùng nguồn
 * `WarehouseList`). Lọc theo chữ gõ SAU lần focus (chưa gõ → đủ gợi ý, trừ giá trị đang có); chạm một
 * gợi ý → điền ô + đóng danh sách. Rời ô → đóng.
 */
export function ReceiverField({
  value,
  onChange,
  error,
  type,
  editable,
  highlighted,
  inputRef,
  onFocus,
  onBlur,
}: {
  value: string
  onChange: (value: string) => void
  error?: string | null
  type: ExportFormType
  editable?: boolean
  highlighted?: boolean
  inputRef?: Ref<TextInputInstance>
  onFocus?: () => void
  onBlur?: () => void
}) {
  const { t } = useTranslation('exportForms')
  const { colors } = useTheme()
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const fetched = useWarehouseStore((s) => s.warehouses)
  const mine = useAuthStore((s) => s.user?.warehouses ?? NO_WAREHOUSES)
  const [open, setOpen] = useState(false)
  // Chưa gõ gì từ lúc focus → chưa lọc (ô đã điền sẵn vẫn thấy đủ gợi ý).
  const [typed, setTyped] = useState(false)
  const [wanted, setWanted] = useState(false)
  const recent = useRecentReceivers(warehouseSlug, wanted)

  const items = useMemo(
    () =>
      receiverSuggestions({
        recent: recent.data ?? [],
        warehouses: fetched ?? mine,
        type,
        currentSlug: warehouseSlug,
        query: typed ? value : '',
        current: value,
      }),
    [recent.data, fetched, mine, type, warehouseSlug, value, typed],
  )
  const shown = open && items.length > 0

  // Danh sách vừa hiện dưới dòng: đưa cả dòng + danh sách lên trên bàn phím nếu bị che.
  const reveal = useRevealInput()
  const box = useRef<ViewInstance>(null)
  useEffect(() => {
    if (shown && reveal && box.current) reveal(box.current)
  }, [shown, reveal])

  const pick = (s: ReceiverSuggestion) => {
    haptics.selection()
    onChange(s.value)
    setOpen(false)
  }

  const recentItems = items.filter((s) => s.kind === 'recent')
  const warehouseItems = items.filter((s) => s.kind === 'warehouse')

  return (
    <View ref={box}>
      <FormInfoRow
        kind="input"
        testID="export-field-receiver"
        label={t('fields.receiver')}
        required
        value={value}
        onChangeText={(v) => {
          onChange(v)
          setTyped(true)
          setOpen(true)
        }}
        onFocus={() => {
          setWanted(true)
          setTyped(false)
          setOpen(true)
          onFocus?.()
        }}
        onBlur={() => {
          setOpen(false)
          onBlur?.()
        }}
        error={error}
        highlighted={highlighted}
        editable={editable}
        inputRef={inputRef}
        maxLength={RECEIVER_MAX}
      />
      {shown ? (
        // Trong nhóm, ngay dưới dòng: lùi trái như dòng, kẻ mảnh phía trên.
        <View
          testID="receiver-suggestions"
          style={{
            marginLeft: 16,
            paddingBottom: 4,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.separator,
          }}
        >
          {[
            { title: t('receiverSuggest.warehouses'), list: warehouseItems },
            { title: t('receiverSuggest.recent'), list: recentItems },
          ]
            .filter((g) => g.list.length > 0)
            .map((g) => (
              <View key={g.title}>
                <Text
                  muted
                  weight="semibold"
                  size={12}
                  style={{ paddingRight: 14, paddingTop: 8, paddingBottom: 2 }}
                >
                  {g.title}
                </Text>
                {g.list.map((s) => (
                  <SuggestionRow key={`${s.kind}:${s.value}`} item={s} onPress={() => pick(s)} />
                ))}
              </View>
            ))}
        </View>
      ) : null}
    </View>
  )
}

function SuggestionRow({ item, onPress }: { item: ReceiverSuggestion; onPress: () => void }) {
  const { t } = useTranslation('exportForms')
  const { colors } = useTheme()
  const Icon = item.kind === 'warehouse' ? Warehouse : History
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        item.kind === 'warehouse'
          ? t('receiverSuggest.warehouseA11y', { name: item.value, code: item.code })
          : item.value
      }
      onPress={onPress}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginLeft: -16,
        paddingLeft: 16,
        paddingRight: 14,
        backgroundColor: pressed ? colors.cellPressed : undefined,
      })}
    >
      <Icon size={16} color={colors.mutedForeground} aria-hidden />
      <Text numberOfLines={1} style={{ flex: 1 }}>
        {item.value}
      </Text>
      {item.kind === 'warehouse' ? (
        <Text code muted size={12} numberOfLines={1}>
          {item.code}
        </Text>
      ) : null}
    </Pressable>
  )
}
