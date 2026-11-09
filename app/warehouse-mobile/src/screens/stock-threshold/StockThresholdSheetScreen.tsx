import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { CircleAlert, PackageX } from '@/shared/ui/icons'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import {
  inventoryErrorMessage,
  inventoryKeys,
  thresholdErrorKey,
  updateInventoryThresholds,
  useInventoryItem,
  type InventoryItem,
} from '@/entities/inventory'
import { getSessionEpoch } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  initialThresholdForm,
  thresholdPatch,
  validateThresholdForm,
  type ThresholdField,
  type ThresholdForm,
} from '@/features/stock-threshold'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useSheetSubmit } from '@/shared/lib/useSheetSubmit'
import { useTheme } from '@/shared/theme/useTheme'
import {
  Button,
  EmptyState,
  FirstLoadState,
  FormField,
  ROW_PRESS_DELAY_MS,
  SheetScaffold,
  Text,
} from '@/shared/ui'

type Key = keyof ThresholdForm

const textOf = (f: ThresholdField) =>
  f.mode === 'custom' ? f.text : f.shown === undefined ? '' : String(f.shown)

/**
 * Route `/stock-threshold?materialSlug=…`: sheet sửa ngưỡng tồn tối thiểu / tối đa của một vật tư trong
 * kho đang chọn. Dòng tồn lấy từ cache danh sách kho và tải lại khi mở; form = từng trường `edits ?? giá trị từ
 * dòng tồn` nên trường chưa đụng luôn theo số mới (không lọt vào patch); kho được ghim lúc mở, đổi kho thì đóng. ✓ khoá khi chưa đổi gì; ✓ kiểm form →
 * hỏi lại (`confirmAction`) → PATCH chỉ trường đã đổi (`null` = về mặc định) → làm mới danh sách kho rồi
 * đóng.
 */
export function StockThresholdSheetScreen() {
  const { t } = useTranslation(['inventory', 'common'])
  const close = useCloseSheet()
  const { materialSlug } = useLocalSearchParams<{ materialSlug: string }>()
  const currentSlug = useWarehouseStore((s) => s.current?.slug)
  // Ghim kho lúc mở sheet: đổi kho khi đang mở thì đóng, không bao giờ ghi sang kho khác.
  const [warehouseSlug] = useState(currentSlug)
  const warehouseChanged = currentSlug !== warehouseSlug
  useEffect(() => {
    if (warehouseChanged) close()
  }, [warehouseChanged, close])
  const query = useInventoryItem(warehouseSlug, materialSlug)
  const { refetch } = query
  // Mở sheet thì lấy số mới nhất (cache có thể đã cũ).
  useEffect(() => {
    void refetch({ cancelRefetch: false })
  }, [refetch])

  const item = query.data
  const failedFirstLoad = !item && query.isError

  if (!item) {
    const missing = query.isSuccess
    return (
      <SheetScaffold
        title={t('inventory:thresholdTitle')}
        cancelLabel={t('common:cancel')}
        onCancel={close}
      >
        {missing ? (
          <View style={{ paddingTop: 24, gap: 16 }}>
            <EmptyState
              icon={PackageX}
              title={t('inventory:thresholdNotInWarehouse')}
              description={t('inventory:notInWarehouseDescription')}
            />
            <Button variant="outline" onPress={close}>
              {t('common:close')}
            </Button>
          </View>
        ) : (
          <FirstLoadState
            failed={failedFirstLoad}
            errorTitle={t('inventory:loadError')}
            errorMessage={inventoryErrorMessage(query.error, t)}
            loadingLabel={t('inventory:loading')}
            fetching={query.isFetching}
            onRetry={() => void refetch({ cancelRefetch: false })}
          />
        )}
      </SheetScaffold>
    )
  }
  if (warehouseChanged) return null
  return (
    <ThresholdSheetBody
      key={`${warehouseSlug}:${materialSlug}`}
      item={item}
      warehouseSlug={warehouseSlug as string}
      onClose={close}
    />
  )
}

function ThresholdSheetBody({
  item,
  warehouseSlug,
  onClose,
}: {
  item: InventoryItem
  warehouseSlug: string
  onClose: () => void
}) {
  const { t } = useTranslation(['inventory', 'common', 'errors'])
  const { colors, radius } = useTheme()
  const queryClient = useQueryClient()
  const [edits, setEdits] = useState<Partial<ThresholdForm>>({})
  const confirming = useRef(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const initial = initialThresholdForm(item)
  // Mỗi trường tự theo dữ liệu mới nhất cho tới khi người dùng đụng vào nó.
  const form: ThresholdForm = { min: edits.min ?? initial.min, max: edits.max ?? initial.max }
  const errors = validateThresholdForm(form)
  const patch = thresholdPatch(initial, form)
  const dirty = Object.keys(patch).length > 0
  const invalid = !!(errors.min || errors.max || errors.range)

  const { doneState, submit } = useSheetSubmit({
    onSubmit: async () => {
      const epoch = getSessionEpoch()
      await updateInventoryThresholds(warehouseSlug, item.materialSlug, patch)
      if (getSessionEpoch() !== epoch) return
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(warehouseSlug) })
    },
    onClose,
    onError: (e) => setSubmitError(t(thresholdErrorKey(e) as 'errors:unknown')),
  })
  const locked = doneState !== 'idle'

  const change = (key: Key, next: ThresholdField) => {
    setSubmitError(null)
    setEdits((e) => ({ ...e, [key]: next }))
  }

  const done = async () => {
    if (locked || !dirty || invalid || confirming.current) return
    confirming.current = true
    setSubmitError(null)
    let confirmed = false
    try {
      confirmed = await confirmAction({
        title: t('inventory:thresholdConfirmTitle'),
        message: t('inventory:thresholdConfirmMessage', { name: item.materialName }),
        confirmLabel: t('inventory:thresholdSave'),
        cancelLabel: t('common:cancel'),
      })
    } finally {
      confirming.current = false
    }
    if (confirmed) await submit()
  }

  const errorOf = (key: Key) => {
    const e = errors[key]
    if (e) return t('inventory:thresholdRequired')
    return key === 'max' && errors.range ? t('inventory:thresholdRange') : undefined
  }

  const unit = item.baseUnit?.name
  const field = (key: Key, label: string) => {
    const f = form[key]
    return (
      <View style={{ gap: 4 }}>
        <FormField
          label={label}
          value={textOf(f)}
          onChangeText={(text) => change(key, { mode: 'custom', text })}
          error={errorOf(key)}
          editable={!locked}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
        />
        {f.mode === 'default' ? (
          <Text muted size={12.5} style={{ marginLeft: 2 }}>
            {t('inventory:thresholdDefaultHint')}
          </Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('inventory:thresholdUseDefault')}
            accessibilityHint={label}
            disabled={locked}
            onPress={() => change(key, { mode: 'default' })}
            unstable_pressDelay={ROW_PRESS_DELAY_MS}
            style={({ pressed }) => ({
              minHeight: 44,
              alignSelf: 'flex-start',
              justifyContent: 'center',
              paddingHorizontal: 2,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text weight="medium" size={14} style={{ color: colors.primary }}>
              {t('inventory:thresholdUseDefault')}
            </Text>
          </Pressable>
        )}
      </View>
    )
  }

  return (
    <SheetScaffold
      testID="stock-threshold-sheet"
      title={t('inventory:thresholdTitle')}
      cancelLabel={t('common:cancel')}
      doneLabel={t('inventory:thresholdSave')}
      onCancel={onClose}
      onDone={() => void done()}
      doneState={doneState}
      doneDisabled={!dirty || invalid}
    >
      <View style={{ gap: 16, paddingTop: 4 }}>
        <View style={{ gap: 2, paddingHorizontal: 2 }}>
          <Text weight="semibold" size={16} numberOfLines={2}>
            {item.materialName}
          </Text>
          {unit ? (
            <Text muted size={13}>
              {unit}
            </Text>
          ) : null}
        </View>
        {field('min', t('inventory:thresholdMin'))}
        {field('max', t('inventory:thresholdMax'))}
        {submitError ? (
          <View
            accessible
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              gap: 8,
              padding: 12,
              borderRadius: radius.group,
              borderWidth: 1,
              borderColor: colors.destructive,
            }}
          >
            <CircleAlert size={16} color={colors.destructive} style={{ marginTop: 2 }} />
            <Text size={14} style={{ flex: 1, color: colors.destructive }}>
              {submitError}
            </Text>
          </View>
        ) : null}
      </View>
    </SheetScaffold>
  )
}
