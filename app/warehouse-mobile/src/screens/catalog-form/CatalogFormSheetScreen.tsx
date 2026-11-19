import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { getSessionEpoch, useAuthStore } from '@/entities/session'
import {
  CATALOG_CONFIG,
  classifyCatalogError,
  EMPTY_CATALOG_FORM,
  isCatalogDirty,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  validateCatalogForm,
  type CatalogConfig,
  type CatalogFormValues,
  type CatalogKind,
  type CatalogRecord,
} from '@/features/catalog-form'
import { errorMessage } from '@/shared/api/error-message'
import { isApiError } from '@/shared/api/http'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useDiscardGuard } from '@/shared/lib/useDiscardGuard'
import { useSheetSubmit } from '@/shared/lib/useSheetSubmit'
import { FirstLoadState, FormField, SheetScaffold, Text, ErrorBox } from '@/shared/ui'

type Field = keyof CatalogFormValues

/**
 * Route `/unit-form` và `/material-type-form` (`?slug=` — không có = tạo mới): sheet gốc TẠO / SỬA một Đơn vị
 * hoặc Loại vật tư (`CATALOG_CONFIG`). Tạo cần `create`, sửa cần `update` — thiếu quyền thì sheet tự đóng.
 * Xem và xoá nằm ở màn chi tiết (`screens/catalog-detail`). ✓ → `confirmAction` → ghi → làm mới danh sách /
 * chi tiết / tồn kho → đóng. Bản ghi không còn (404) KHÔNG tự đóng: báo ở đầu sheet để người dùng đọc rồi ✕.
 */
export function CatalogFormSheetScreen({ kind }: { kind: CatalogKind }) {
  const { t } = useTranslation(['catalog', 'common', 'errors'])
  const config = CATALOG_CONFIG[kind]
  const close = useCloseSheet()
  const { slug } = useLocalSearchParams<{ slug?: string }>()
  const user = useAuthStore((s) => s.user)
  const abilities = config.abilities(user)
  const query = config.useItem(slug)
  const item = query.data ?? null

  const queryClient = useQueryClient()
  const loadMissing = !!slug && !item && isApiError(query.error) && query.error.statusCode === 404
  // Bản ghi không còn khi tải → danh sách đang giữ dòng cũ, làm mới nó.
  useEffect(() => {
    if (loadMissing) void queryClient.invalidateQueries({ queryKey: config.listKey })
  }, [loadMissing, queryClient, config.listKey])
  // Mở tạo mà thiếu `create`, hoặc mở sửa mà thiếu `update` (deep link / quyền vừa đổi) → đóng ngay.
  const denied = slug ? !abilities.update : !abilities.create
  useEffect(() => {
    if (denied) close()
  }, [denied, close])
  if (denied) return null

  if (slug && !item) {
    const missing = loadMissing
    return (
      <SheetScaffold
        title={t(`catalog:${config.i18nPrefix}.title`)}
        cancelLabel={t('common:cancel')}
        onCancel={close}
      >
        {missing ? (
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
    <CatalogFormBody key={slug ?? 'new'} kind={kind} config={config} item={item} onClose={close} />
  )
}

function CatalogFormBody({
  kind,
  config,
  item,
  onClose,
}: {
  kind: CatalogKind
  config: CatalogConfig
  item: CatalogRecord | null
  onClose: () => void
}) {
  const { t } = useTranslation(['catalog', 'common', 'errors'])
  const queryClient = useQueryClient()
  const prefix = config.i18nPrefix
  // Ảnh chụp gốc lúc mở form (có thể là bản cũ từ cache danh sách): dirty và PATCH so với đúng bản mà
  // `values` khởi tạo từ đó — bản tải lại sau này không bao giờ làm
  // trường người dùng chưa đụng bị coi là "đã đổi" (hoặc bị ghi đè).
  const [baseline] = useState(item)
  const [values, setValues] = useState<CatalogFormValues>(() =>
    baseline ? toFormValues(baseline) : EMPTY_CATALOG_FORM,
  )
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [serverErrors, setServerErrors] = useState<Partial<Record<'code' | 'name', string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const confirming = useRef(false)

  const readOnly = notFound
  const errors = validateCatalogForm(kind, values)
  const invalid = Object.keys(errors).length > 0
  const dirty = isCatalogDirty(values, baseline)

  const refreshAll = async (slug?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: config.listKey }),
      slug ? queryClient.invalidateQueries({ queryKey: config.detailKey(slug) }) : undefined,
      queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    ])
  }

  /** Lỗi ghi → ô tương ứng, "không còn" hoặc hộp lỗi đầu sheet. */
  const handleError = (e: unknown) => {
    const target = classifyCatalogError(kind, e)
    if ('field' in target) {
      setServerErrors((s) => ({ ...s, [target.field]: errorMessage(e, t) }))
    } else if ('target' in target && target.target === 'notFound') {
      setNotFound(true)
      void queryClient.invalidateQueries({ queryKey: config.listKey })
    } else {
      setSubmitError(errorMessage(e, t))
    }
  }

  const { doneState, submit } = useSheetSubmit({
    onSubmit: async () => {
      const epoch = getSessionEpoch()
      if (baseline) await config.update(baseline.slug, toUpdateInput(values, baseline))
      else await config.create(toCreateInput(values))
      if (getSessionEpoch() !== epoch) return
      await refreshAll(baseline?.slug)
    },
    onClose,
    onError: handleError,
  })

  const busy = doneState !== 'idle'
  const { confirmLeave } = useDiscardGuard({ dirty, enabled: !readOnly && !busy })

  const change = (field: Field, text: string) => {
    setSubmitError(null)
    setTouched((s) => ({ ...s, [field]: true }))
    if (field !== 'description') setServerErrors((s) => ({ ...s, [field]: undefined }))
    setValues((v) => ({ ...v, [field]: text }))
  }

  const done = async () => {
    if (busy || !dirty || invalid || confirming.current) return
    confirming.current = true
    setSubmitError(null)
    let confirmed = false
    try {
      confirmed = await confirmAction({
        title: t(item ? `catalog:${prefix}.saveConfirm` : `catalog:${prefix}.createConfirm`),
        message: item ? undefined : `${toCreateInput(values).code} · ${toCreateInput(values).name}`,
        confirmLabel: t(item ? 'catalog:save' : 'catalog:createAction'),
        cancelLabel: t('common:cancel'),
      })
    } finally {
      confirming.current = false
    }
    if (confirmed) await submit()
  }

  const errorOf = (field: Field): string | undefined => {
    if (field !== 'description' && serverErrors[field]) return serverErrors[field]
    const e = errors[field]
    return touched[field] && e ? t(`catalog:field.${e}`) : undefined
  }

  const leave = async () => {
    if (await confirmLeave()) onClose()
  }

  const codeHint = kind === 'unit' ? t('catalog:codeHintUnit') : t('catalog:codeHintBusiness')
  const showDone = !readOnly

  return (
    <SheetScaffold
      testID="catalog-form-sheet"
      title={t(item ? `catalog:${prefix}.title` : `catalog:${prefix}.create`)}
      cancelLabel={t('common:cancel')}
      doneLabel={showDone ? t(item ? 'catalog:save' : 'catalog:createAction') : undefined}
      onCancel={() => void leave()}
      onDone={showDone ? () => void done() : undefined}
      doneState={doneState}
      doneDisabled={!dirty || invalid}
    >
      <View style={{ gap: 16, paddingTop: 4 }}>
        {notFound ? <ErrorBox message={t('catalog:notFound')} /> : null}
        {submitError ? <ErrorBox message={submitError} /> : null}
        <View style={{ gap: 4 }}>
          <FormField
            label={t('catalog:code')}
            value={values.code}
            onChangeText={(text) => change('code', text)}
            onBlur={() => setTouched((s) => ({ ...s, code: true }))}
            error={errorOf('code')}
            editable={!readOnly && !busy}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
          />
          {!readOnly && !errorOf('code') ? (
            <Text muted size={12.5} style={{ marginLeft: 2 }}>
              {codeHint}
            </Text>
          ) : null}
        </View>
        <FormField
          label={t('catalog:name')}
          value={values.name}
          onChangeText={(text) => change('name', text)}
          onBlur={() => setTouched((s) => ({ ...s, name: true }))}
          error={errorOf('name')}
          editable={!readOnly && !busy}
          returnKeyType="next"
        />
        <FormField
          label={t('catalog:description')}
          placeholder={readOnly ? undefined : t('catalog:optional')}
          value={values.description}
          onChangeText={(text) => change('description', text)}
          onBlur={() => setTouched((s) => ({ ...s, description: true }))}
          error={errorOf('description')}
          editable={!readOnly && !busy}
          multiline
        />
      </View>
    </SheetScaffold>
  )
}
