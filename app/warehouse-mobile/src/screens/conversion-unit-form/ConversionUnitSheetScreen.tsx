import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  addConversionUnit,
  materialAbilities,
  removeConversionUnit,
  updateConversionUnit,
  useMaterial,
  type Material,
  type MaterialUnit,
} from '@/entities/material'
import { getSessionEpoch, useAuthStore } from '@/entities/session'
import {
  classifyConversionError,
  invalidateAfterMaterialWrite,
  useMaterialDraft,
  validateConversionForm,
} from '@/features/material-form'
import { errorMessage } from '@/shared/api/error-message'
import { isApiError } from '@/shared/api/http'
import { formatQuantity, parseDecimalInput } from '@/shared/lib/format'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useDiscardGuard } from '@/shared/lib/useDiscardGuard'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'
import { useSheetSubmit } from '@/shared/lib/useSheetSubmit'
import {
  Button,
  FirstLoadState,
  FormGroup,
  FormInfoRow,
  SheetScaffold,
  ErrorBox,
} from '@/shared/ui'

/** Phiên đổi giữa lúc ghi: bỏ kết quả, không làm mới cache, không đóng. */
const STALE_SESSION = new Error('session-changed')

/**
 * Route `/conversion-unit-form?material=&unit=`: sheet THÊM (không `unit`) / SỬA tỉ lệ / GỠ một đơn vị quy
 * đổi của vật tư. Cần `manageConversions` — thiếu quyền thì sheet tự đóng. Đơn vị chọn ở màn con `pick`
 * (kết quả qua `useMaterialDraft`). Dòng quy đổi không còn → báo ở đầu sheet, ẩn ✓ và Gỡ, KHÔNG tự đóng.
 */
export function ConversionUnitSheetScreen() {
  const { t } = useTranslation(['catalog', 'common', 'errors'])
  const close = useCloseSheet()
  const { material: slug, unit } = useLocalSearchParams<{ material?: string; unit?: string }>()
  const user = useAuthStore((s) => s.user)
  const denied = !materialAbilities(user).manageConversions
  const missingParam = !slug
  const query = useMaterial(denied || missingParam ? undefined : slug)
  const material = query.data ?? null
  const queryClient = useQueryClient()

  useEffect(() => {
    if (denied || missingParam) close()
  }, [denied, missingParam, close])
  const loadMissing = !material && isApiError(query.error) && query.error.statusCode === 404
  useEffect(() => {
    if (loadMissing) void invalidateAfterMaterialWrite(queryClient)
  }, [loadMissing, queryClient])
  if (denied || missingParam) return null

  if (!material) {
    return (
      <SheetScaffold
        title={t('catalog:conversion.title')}
        cancelLabel={t('common:cancel')}
        onCancel={close}
      >
        {loadMissing ? (
          <View style={{ paddingTop: 8 }}>
            <ErrorBox message={t('catalog:notFound')} />
          </View>
        ) : (
          <FirstLoadState
            failed={query.isError}
            errorTitle={t('catalog:loadError')}
            errorMessage={errorMessage(query.error, t)}
            loadingLabel={t('catalog:loading')}
            fetching={query.isFetching}
            onRetry={() => void query.refetch({ cancelRefetch: false })}
          />
        )}
      </SheetScaffold>
    )
  }
  return (
    <ConversionBody
      key={`${slug}:${unit ?? 'new'}`}
      material={material}
      unitSlug={unit}
      onClose={close}
    />
  )
}

function ConversionBody({
  material,
  unitSlug,
  onClose,
}: {
  material: Material
  unitSlug?: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation(['catalog', 'common', 'errors'])
  const router = useRouter()
  const queryClient = useQueryClient()
  const locale = i18n.language === 'en' ? 'en' : 'vi'
  // Dòng quy đổi gốc lúc mở (chỉ khi sửa); không thấy dòng → coi như đã bị gỡ.
  const [row] = useState<MaterialUnit | null>(
    () => material.units.find((u) => u.unitSlug === unitSlug && !u.isBaseUnit) ?? null,
  )
  const editing = unitSlug !== undefined
  const [rate, setRate] = useState(row ? String(row.conversionRate) : '')
  const [touchedRate, setTouchedRate] = useState(false)
  const picked = useMaterialDraft((s) => s.unit)
  useLayoutEffect(() => {
    useMaterialDraft.getState().reset()
  }, [])

  const [unitError, setUnitError] = useState<string | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(editing && !row)
  const confirming = useRef(false)

  const errors = validateConversionForm({
    unit: editing
      ? { slug: unitSlug, code: row?.unitCode ?? '', name: row?.unitName ?? '' }
      : picked,
    rate,
  })
  const invalid = !!errors.unit || !!errors.rate
  const dirty = editing
    ? row !== null && parseDecimalInput(rate) !== row.conversionRate
    : picked !== null || rate.trim() !== ''
  const readOnly = notFound
  const unitRef = editing ? { code: row?.unitCode ?? unitSlug, name: row?.unitName ?? '' } : picked
  const unitLabel = unitRef ? `${unitRef.code} · ${unitRef.name}` : null
  const parsedRate = parseDecimalInput(rate)
  const hint =
    unitRef && parsedRate !== null && !errors.rate
      ? t('catalog:conversion.rateHint', {
          unit: unitRef.code,
          rate: formatQuantity(parsedRate, locale, 6),
          base: material.baseUnit?.code ?? '',
        })
      : null

  const handleError = (e: unknown) => {
    if (e === STALE_SESSION) return
    const target = classifyConversionError(e)
    if ('field' in target && target.field === 'unit') {
      setUnitError(errorMessage(e, t))
      void invalidateAfterMaterialWrite(queryClient, material.slug)
    } else if ('field' in target && target.field === 'rate') {
      setRateError(errorMessage(e, t))
    } else if ('target' in target && target.target === 'notFound') {
      setNotFound(true)
      void invalidateAfterMaterialWrite(queryClient, material.slug)
    } else {
      setSubmitError(errorMessage(e, t))
    }
  }

  const { doneState, submit } = useSheetSubmit({
    onSubmit: async () => {
      const epoch = getSessionEpoch()
      const conversionRate = parsedRate ?? 0
      if (editing) await updateConversionUnit(material.slug, unitSlug, { conversionRate })
      else await addConversionUnit(material.slug, { unitSlug: picked?.slug ?? '', conversionRate })
      if (getSessionEpoch() !== epoch) throw STALE_SESSION
      await invalidateAfterMaterialWrite(queryClient, material.slug)
    },
    onClose,
    onError: handleError,
  })

  const remover = useGuardedAction(
    async () => {
      const epoch = getSessionEpoch()
      await removeConversionUnit(material.slug, unitSlug as string)
      if (getSessionEpoch() !== epoch) throw STALE_SESSION
      await invalidateAfterMaterialWrite(queryClient, material.slug)
    },
    { onError: handleError },
  )
  const busy = doneState !== 'idle' || remover.pending
  const { confirmLeave } = useDiscardGuard({ dirty, enabled: !readOnly && !busy })

  const done = async () => {
    if (busy || !dirty || invalid || confirming.current) return
    confirming.current = true
    setSubmitError(null)
    let confirmed = false
    try {
      confirmed = await confirmAction({
        title: t(editing ? 'catalog:conversion.saveConfirm' : 'catalog:conversion.addConfirm'),
        message: hint ?? undefined,
        confirmLabel: t(editing ? 'catalog:save' : 'catalog:createAction'),
        cancelLabel: t('common:cancel'),
      })
    } finally {
      confirming.current = false
    }
    if (confirmed) await submit()
  }

  const remove = async () => {
    if (busy || confirming.current) return
    confirming.current = true
    setSubmitError(null)
    let confirmed = false
    try {
      confirmed = await confirmAction({
        title: t('catalog:conversion.removeConfirm', { code: unitRef?.code ?? '' }),
        message: t('catalog:conversion.removeWarning'),
        confirmLabel: t('catalog:conversion.remove'),
        cancelLabel: t('common:cancel'),
        destructive: true,
      })
    } finally {
      confirming.current = false
    }
    if (confirmed && (await remover.run())) onClose()
  }

  const leave = async () => {
    if (await confirmLeave()) onClose()
  }
  const rateErrorText =
    rateError ??
    (touchedRate && errors.rate
      ? t(
          errors.rate === 'required'
            ? 'catalog:conversion.field.rateRequired'
            : 'catalog:conversion.field.rateInvalid',
        )
      : undefined)
  const editable = !readOnly && !busy

  return (
    <SheetScaffold
      testID="conversion-unit-sheet"
      title={t(editing ? 'catalog:conversion.title' : 'catalog:conversion.add')}
      cancelLabel={t('common:cancel')}
      doneLabel={readOnly ? undefined : t(editing ? 'catalog:save' : 'catalog:createAction')}
      onCancel={() => void leave()}
      onDone={readOnly ? undefined : () => void done()}
      doneState={doneState}
      doneDisabled={!dirty || invalid}
      grouped
    >
      <View style={{ gap: 16, paddingTop: 4 }}>
        {notFound ? <ErrorBox message={t('catalog:notFound')} /> : null}
        {submitError ? <ErrorBox message={submitError} /> : null}
        <FormGroup footer={hint ?? undefined} footerNumeric>
          {editing ? (
            <FormInfoRow
              kind="readonly"
              first
              label={t('catalog:conversion.unit')}
              value={unitLabel}
            />
          ) : (
            <FormInfoRow
              kind="picker"
              first
              required
              label={t('catalog:conversion.unit')}
              value={unitLabel}
              disabled={!editable}
              error={unitError}
              onPress={() => {
                setUnitError(null)
                router.push({
                  pathname: '/conversion-unit-form/pick',
                  params: { field: 'unit', material: material.slug },
                })
              }}
            />
          )}
          <FormInfoRow
            kind="input"
            label={t('catalog:conversion.rate')}
            value={rate}
            onChangeText={(s) => {
              setSubmitError(null)
              setRateError(null)
              setTouchedRate(true)
              setRate(s)
            }}
            onBlur={() => setTouchedRate(true)}
            error={rateErrorText}
            editable={editable}
            keyboardType="decimal-pad"
          />
        </FormGroup>
        {editing && !notFound ? (
          <Button variant="destructive" disabled={busy} onPress={() => void remove()}>
            {t('catalog:conversion.remove')}
          </Button>
        ) : null}
      </View>
    </SheetScaffold>
  )
}
