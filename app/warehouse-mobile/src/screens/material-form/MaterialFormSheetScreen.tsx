import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, View } from 'react-native'

import {
  createMaterial,
  isBaseUnitLocked,
  materialAbilities,
  updateMaterial,
  useMaterial,
  type Material,
} from '@/entities/material'
import { createMaterialInWarehouse, inventoryKeys } from '@/entities/inventory'
import { useSuppliers } from '@/entities/import-form'
import { can, getSessionEpoch, useAuthStore, type UserWarehouse } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  attachToSuppliers,
  classifyMaterialError,
  invalidateAfterMaterialWrite,
  isMaterialDirty,
  useMaterialDraft,
  toMaterialCreateInput,
  toMaterialUpdateInput,
  validateMaterialForm,
  type MaterialField,
  type MaterialFormValues,
} from '@/features/material-form'
import {
  addImportLines,
  formSupplierSlug,
  MAX_ITEMS,
  supplierNameLookup,
  toAvailableMaterial,
  useReceiveDraft,
  useScanNotice,
} from '@/features/receive-checklist'
import {
  assignToWarehouses,
  canAssignWarehouse,
  canAttachSupplier,
  canCreateInWarehouse,
} from '@/features/warehouse-assign'
import { errorMessage } from '@/shared/api/error-message'
import { isApiError } from '@/shared/api/http'
import { useLineFocus } from '@/shared/lib/line-focus'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useDiscardGuard } from '@/shared/lib/useDiscardGuard'
import { useSheetSubmit } from '@/shared/lib/useSheetSubmit'
import { useTheme } from '@/shared/theme/useTheme'
import { FirstLoadState, FormGroup, FormInfoRow, SheetScaffold, ErrorBox } from '@/shared/ui'
import { ScanBarcode } from '@/shared/ui/icons'

type TextField = 'code' | 'name' | 'min' | 'max'
/** Phiên đổi giữa lúc ghi: bỏ kết quả, không làm mới cache, không đóng (sheet sắp bị rời bởi đổi phiên). */
const STALE_SESSION = new Error('session-changed')
/** Chặn trước khi tạo (phiếu đầy / đang lưu / đã đổi): đã báo ở hộp lỗi, không phải lỗi để hiện lại. */
const IMPORT_BLOCKED = new Error('import-blocked')
const SERVER_FIELDS: readonly string[] = ['code', 'name', 'type', 'baseUnit', 'min', 'max']

/** Nút quét mã vạch bên phải ô Mã (vùng chạm 44). */
function ScanCodeButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation(['catalog'])
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('catalog:material.scanCode')}
      onPress={onPress}
      hitSlop={4}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <ScanBarcode size={20} color={colors.accent} />
    </Pressable>
  )
}

/**
 * Route `/material-form` (`?slug=` — không có = tạo mới): sheet gốc TẠO / SỬA vật tư. Tạo cần `create`, sửa
 * cần `update` (cả hai kèm `UNIT_READ` để chọn đơn vị) — thiếu quyền thì sheet tự đóng. Loại / Đơn vị gốc
 * chọn ở màn con `pick` (kết quả qua `useMaterialDraft`). Vật tư không còn (404) KHÔNG tự đóng: báo ở đầu
 * sheet để người dùng đọc rồi ✕.
 */
export function MaterialFormSheetScreen() {
  const { t } = useTranslation(['catalog', 'common', 'errors'])
  const close = useCloseSheet()
  const { slug, code, name, importForm } = useLocalSearchParams<{
    slug?: string
    code?: string
    name?: string
    importForm?: string
  }>()
  const user = useAuthStore((s) => s.user)
  const abilities = materialAbilities(user)
  const warehouse = useWarehouseStore((s) => s.current)
  // Chế độ "tạo trong phiếu nhập": chỉ tạo mới, cần đủ quyền, kho đang chọn và đúng bản nháp phiếu đang soạn.
  const importMatches = useReceiveDraft(
    (s) =>
      !!importForm &&
      !!s.draft &&
      s.ctx?.formSlug === importForm &&
      s.ctx.warehouseSlug === warehouse?.slug,
  )
  const denied = importForm
    ? !!slug || !warehouse || !canCreateInWarehouse(user) || !abilities.read || !importMatches
    : slug
      ? !abilities.update
      : !abilities.create
  const query = useMaterial(denied ? undefined : slug)
  const item = query.data ?? null
  const queryClient = useQueryClient()

  const loadMissing = !!slug && !item && isApiError(query.error) && query.error.statusCode === 404
  useEffect(() => {
    if (loadMissing) void invalidateAfterMaterialWrite(queryClient)
  }, [loadMissing, queryClient])
  useEffect(() => {
    if (denied) close()
  }, [denied, close])
  if (denied) return null

  if (slug && !item) {
    return (
      <SheetScaffold
        title={t('catalog:material.title')}
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
    <MaterialFormBody
      key={slug ?? 'new'}
      item={item}
      initialCode={code}
      initialName={name}
      importTarget={importForm && warehouse ? { formSlug: importForm, warehouse } : undefined}
      onClose={close}
    />
  )
}

function MaterialFormBody({
  item,
  initialCode,
  initialName,
  importTarget,
  onClose,
}: {
  item: Material | null
  /** Param `code` (tạo mới): Mã điền sẵn. */
  initialCode?: string
  /** Param `name` (tạo mới): Tên điền sẵn. */
  initialName?: string
  /** Tạo trong phiếu nhập `formSlug`: gắn vào `warehouse` (+ bên bán của phiếu) rồi thêm dòng vào phiếu. */
  importTarget?: { formSlug: string; warehouse: UserWarehouse }
  onClose: () => void
}) {
  const { t } = useTranslation(['catalog', 'common', 'errors', 'importForms'])
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const fetchedWarehouses = useWarehouseStore((s) => s.warehouses)
  // Tạo thường (không phiếu nhập, không sửa) có quyền gắn kho: chọn kho gắn vật tư ngay khi tạo.
  const pickWarehouses = !item && !importTarget && canAssignWarehouse(user)
  const allWarehouses = fetchedWarehouses ?? user?.warehouses ?? []
  const importDraft = useReceiveDraft((s) => (importTarget ? s.draft : null))
  // Tạo thường có quyền gắn bên bán: chọn bên bán gắn vật tư ngay khi tạo (phiếu nhập đã theo NCC của phiếu).
  const pickSuppliers = !item && !importTarget && canAttachSupplier(user)
  const suppliers = useSuppliers((!!importTarget && can(user, 'SUPPLIER_READ')) || pickSuppliers)
  const supplierLookup = supplierNameLookup({
    suppliers: suppliers.data,
    lines: importDraft?.lines,
  })
  const importSupplier = importDraft ? formSupplierSlug(importDraft, user) : null
  // Ảnh chụp gốc lúc mở form: dirty và PATCH so với đúng bản mà form khởi tạo từ đó.
  const [baseline] = useState(item)
  const [texts, setTexts] = useState({
    code: baseline?.code ?? initialCode?.toUpperCase() ?? '',
    name: baseline?.name ?? initialName ?? '',
    min: baseline && baseline.minimumInventory !== 0 ? String(baseline.minimumInventory) : '',
    max: baseline && baseline.maximumInventory !== 0 ? String(baseline.maximumInventory) : '',
  })
  const type = useMaterialDraft((s) => s.type)
  const baseUnit = useMaterialDraft((s) => s.baseUnit)
  const pickedWarehouses = useMaterialDraft((s) => s.warehouses)
  const pickedSuppliers = useMaterialDraft((s) => s.suppliers)
  // Mở sheet: xoá lựa chọn cũ rồi nạp loại / đơn vị gốc hiện có (sửa). Không reset khi đóng (có thể chạy sau
  // `set()` của sheet mở lại); reset theo phiên đã có ở session-wiring.
  useLayoutEffect(() => {
    const store = useMaterialDraft.getState()
    store.reset()
    if (baseline) {
      store.set('type', baseline.type)
      if (baseline.baseUnit) store.set('baseUnit', baseline.baseUnit)
    }
  }, [baseline])
  // Kho mặc định (kho đang chọn nếu còn hoạt động): nạp MỘT lần khi form có dòng Kho; không đụng loại / đơn vị.
  useLayoutEffect(() => {
    if (!pickWarehouses) return
    const store = useMaterialDraft.getState()
    if (store.warehouses !== null) return
    const current = useWarehouseStore.getState().current
    store.setWarehouses(current && current.isActive !== false ? [current.slug] : [])
  }, [pickWarehouses])
  // Bên bán mặc định rỗng: nạp MỘT lần khi form có dòng Bên bán (không đụng lựa chọn khác).
  useLayoutEffect(() => {
    if (!pickSuppliers) return
    const store = useMaterialDraft.getState()
    if (store.suppliers === null) store.setSuppliers([])
  }, [pickSuppliers])
  // Bên bán sẽ gắn: tin slug đã chọn trong bản nháp (danh sách có thể cũ); PUT lỗi thì báo ở hộp Alert.
  const supplierSlugs = pickSuppliers ? (pickedSuppliers ?? []) : []
  const sellerName = (slug: string) => suppliers.data?.find((s) => s.slug === slug)?.name ?? slug
  // Kho sẽ gắn: chỉ kho còn trong danh sách và đang hoạt động (danh sách kho có thể đổi sau khi chọn).
  const warehouseSlugs = pickWarehouses
    ? (pickedWarehouses ?? []).filter((slug) =>
        allWarehouses.some((w) => w.slug === slug && w.isActive !== false),
      )
    : []
  const warehouseName = (slug: string) => allWarehouses.find((w) => w.slug === slug)?.name ?? slug

  const [touched, setTouched] = useState<Partial<Record<MaterialField, boolean>>>({})
  const [serverErrors, setServerErrors] = useState<Partial<Record<MaterialField, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  // Mã vừa quét (đã viết hoa) và chưa bị sửa tay: nếu sai quy tắc thì báo riêng "mã quét được".
  const [scanned, setScanned] = useState<string | null>(null)
  const confirming = useRef(false)

  const values: MaterialFormValues = { ...texts, type, baseUnit }
  const errors = validateMaterialForm(values)
  const invalid = Object.keys(errors).length > 0
  const dirty = isMaterialDirty(values, baseline)
  const readOnly = notFound
  const locked = !!baseline && isBaseUnitLocked(baseline)

  const handleError = (e: unknown) => {
    if (e === STALE_SESSION || e === IMPORT_BLOCKED) return
    const target = classifyMaterialError(e)
    if ('field' in target && SERVER_FIELDS.includes(target.field)) {
      setServerErrors((s) => ({ ...s, [target.field]: errorMessage(e, t) }))
    } else if ('target' in target && target.target === 'notFound') {
      setNotFound(true)
      void invalidateAfterMaterialWrite(queryClient, baseline?.slug)
    } else {
      setSubmitError(errorMessage(e, t))
    }
  }

  /** Tạo trong phiếu: câu báo nếu lúc này KHÔNG được tạo (phiếu đủ dòng, đang lưu, hoặc đã đổi phiếu / kho). */
  const importBlock = (): string | null => {
    if (!importTarget) return null
    const { ctx, draft, saving } = useReceiveDraft.getState()
    if (
      !draft ||
      saving ||
      ctx?.formSlug !== importTarget.formSlug ||
      ctx.warehouseSlug !== importTarget.warehouse.slug
    ) {
      return t('catalog:material.importUnavailable')
    }
    if (draft.lines.length >= MAX_ITEMS) {
      return t('importForms:compose.scanFull', { code: values.code.trim(), max: MAX_ITEMS })
    }
    return null
  }

  const { doneState, submit } = useSheetSubmit({
    onSubmit: async () => {
      const epoch = getSessionEpoch()
      if (importTarget) {
        const { formSlug, warehouse } = importTarget
        const block = importBlock()
        if (block) {
          setSubmitError(block)
          throw IMPORT_BLOCKED
        }
        const draft = useReceiveDraft.getState().draft
        const supplierSlug = draft ? formSupplierSlug(draft, user) : null
        const created = await createMaterialInWarehouse(warehouse.slug, {
          material: toMaterialCreateInput(values),
          ...(supplierSlug ? { supplierSlug } : null),
        })
        if (getSessionEpoch() !== epoch) throw STALE_SESSION
        // Dòng vào phiếu TRƯỚC khi đợi làm mới cache (phiên có thể đổi trong lúc đợi).
        const after = useReceiveDraft.getState().ctx
        if (after?.formSlug === formSlug && after.warehouseSlug === warehouse.slug) {
          const known = supplierSlug ? suppliers.data?.find((s) => s.slug === supplierSlug) : null
          const supplier = supplierSlug
            ? (known ?? {
                slug: supplierSlug,
                code: supplierSlug,
                name: supplierLookup(supplierSlug) ?? supplierSlug,
              })
            : undefined
          const keys = addImportLines([toAvailableMaterial(created, supplier)], {
            supplierName: supplierLookup,
            user,
          })
          if (keys[0]) {
            useLineFocus.getState().ask('import', formSlug, keys[0])
            useScanNotice.getState().clear()
          } else {
            // Vật tư đã tạo nhưng không vào được phiếu: báo ở màn soạn thay vì đóng im lặng.
            const now = useReceiveDraft.getState()
            const reason =
              (now.draft?.lines.length ?? 0) >= MAX_ITEMS
                ? 'full'
                : created.units.length === 0
                  ? 'noUnit'
                  : null
            if (reason) useScanNotice.getState().show(formSlug, created.materialCode, reason)
          }
        }
        await Promise.all([
          invalidateAfterMaterialWrite(queryClient, created.materialSlug),
          queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(warehouse.slug) }),
        ])
        return
      }
      if (!baseline) {
        // Tạo (+ gắn kho đầu trong một transaction nếu có kho), rồi gắn kho còn lại / bên bán lần lượt. Vật tư đã
        // tạo thì KHÔNG tạo lại: bước phụ lỗi → gộp vào MỘT hộp báo rồi vẫn đóng.
        let materialSlug: string
        let attachedWarehouses: string[] = []
        const failedLines: string[] = []
        if (warehouseSlugs.length > 0) {
          const [first, ...rest] = warehouseSlugs
          const created = await createMaterialInWarehouse(first, {
            material: toMaterialCreateInput(values),
          })
          if (getSessionEpoch() !== epoch) throw STALE_SESSION
          materialSlug = created.materialSlug
          const result = await assignToWarehouses(
            created.materialSlug,
            rest,
            () => getSessionEpoch() !== epoch,
          )
          if (result.stale) throw STALE_SESSION
          attachedWarehouses = [first, ...result.ok]
          for (const f of result.failed) {
            const reason =
              f.reason === 'reassign'
                ? t('catalog:warehouseAssign.reasonReassign')
                : f.reason === 'notFound'
                  ? t('catalog:warehouseAssign.reasonNotFound')
                  : errorMessage(f.error, t)
            failedLines.push(`${warehouseName(f.slug)}: ${reason}`)
          }
        } else {
          const created = await createMaterial(toMaterialCreateInput(values))
          if (getSessionEpoch() !== epoch) throw STALE_SESSION
          materialSlug = created.slug
        }
        if (supplierSlugs.length > 0) {
          const result = await attachToSuppliers(
            materialSlug,
            supplierSlugs,
            () => getSessionEpoch() !== epoch,
          )
          if (result.stale) throw STALE_SESSION
          for (const f of result.failed) {
            failedLines.push(
              t('catalog:material.supplierFailLine', {
                name: sellerName(f.slug),
                reason: errorMessage(f.error, t),
              }),
            )
          }
        }
        await Promise.all([
          invalidateAfterMaterialWrite(queryClient, materialSlug),
          ...attachedWarehouses.map((w) =>
            queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(w) }),
          ),
        ])
        if (failedLines.length > 0) {
          Alert.alert(
            t('catalog:material.warehousesPartialTitle'),
            t('catalog:material.warehousesPartialBody', { list: failedLines.join('\n') }),
          )
        }
        return
      }
      await updateMaterial(baseline.slug, toMaterialUpdateInput(values, baseline))
      if (getSessionEpoch() !== epoch) throw STALE_SESSION
      await invalidateAfterMaterialWrite(queryClient, baseline?.slug)
    },
    onClose,
    onError: handleError,
  })
  const busy = doneState !== 'idle'
  const { confirmLeave } = useDiscardGuard({ dirty, enabled: !readOnly && !busy })

  const change = (field: TextField, text: string) => {
    setSubmitError(null)
    setTouched((s) => ({ ...s, [field]: true }))
    setServerErrors((s) => ({ ...s, [field]: undefined }))
    if (field === 'code') setScanned(null)
    setTexts((v) => ({ ...v, [field]: text }))
  }
  // Mã quét từ màn con `scan` (store ghi, form nhận qua subscribe rồi xoá).
  useEffect(
    () =>
      useMaterialDraft.subscribe((state) => {
        if (state.scannedCode === null) return
        const code = state.scannedCode.toUpperCase()
        state.setScannedCode(null)
        setTouched((s) => ({ ...s, code: true }))
        setServerErrors((s) => ({ ...s, code: undefined }))
        setSubmitError(null)
        setTexts((v) => ({ ...v, code }))
        setScanned(code)
      }),
    [],
  )
  const blur = (field: TextField) => setTouched((s) => ({ ...s, [field]: true }))

  const openPick = (field: 'type' | 'baseUnit') => {
    setServerErrors((s) => ({ ...s, [field]: undefined }))
    router.push({ pathname: '/material-form/pick', params: { field } })
  }

  const openWarehouses = () => router.push('/material-form/warehouses')
  const openSuppliers = () => router.push('/material-form/suppliers')

  const openScan = () => router.push('/material-form/scan')

  const done = async () => {
    if (busy || !dirty || invalid || confirming.current) return
    confirming.current = true
    setSubmitError(null)
    let confirmed = false
    const block = importBlock()
    if (block) {
      confirming.current = false
      setSubmitError(block)
      return
    }
    try {
      const input = toMaterialCreateInput(values)
      confirmed = await confirmAction({
        title: t(baseline ? 'catalog:material.saveConfirm' : 'catalog:material.createConfirm'),
        message: baseline
          ? undefined
          : [
              `${input.code} · ${input.name}`,
              warehouseSlugs.length > 0
                ? t('catalog:material.createAttach', {
                    warehouses: warehouseSlugs.map(warehouseName).join(', '),
                  })
                : null,
              supplierSlugs.length > 0
                ? t('catalog:material.createAttachSuppliers', {
                    suppliers: supplierSlugs.map(sellerName).join(', '),
                  })
                : null,
            ]
              .filter(Boolean)
              .join('\n'),
        confirmLabel: t(baseline ? 'catalog:save' : 'catalog:createAction'),
        cancelLabel: t('common:cancel'),
      })
    } finally {
      confirming.current = false
    }
    if (confirmed) await submit()
  }

  const errorOf = (field: MaterialField): string | undefined => {
    if (serverErrors[field]) return serverErrors[field]
    const e = errors[field]
    if (!e || !touched[field]) return undefined
    if (field === 'code' && e === 'codeInvalid' && scanned !== null && scanned === texts.code) {
      return t('catalog:material.field.scannedCodeInvalid')
    }
    if (e === 'numberInvalid' || e === 'rangeInvalid') return t(`catalog:material.field.${e}`)
    return t(`catalog:field.${e === 'required' || e === 'tooLong' ? e : 'codeInvalid'}`)
  }
  // Tối đa < tối thiểu: báo dưới Tối đa ngay khi đã gõ Tối thiểu.
  const maxError =
    serverErrors.max ??
    (errors.max === 'rangeInvalid' && (touched.max || touched.min)
      ? t('catalog:material.field.rangeInvalid')
      : errorOf('max'))

  const leave = async () => {
    if (await confirmLeave()) onClose()
  }
  const refName = (r: { code: string; name: string } | null) => (r ? `${r.code} · ${r.name}` : null)
  const editable = !readOnly && !busy
  const codeFooter = importTarget
    ? `${t('catalog:codeHintBusiness')}\n${
        importSupplier
          ? t('catalog:material.importAttachBoth', {
              warehouse: importTarget.warehouse.name,
              supplier: supplierLookup(importSupplier) ?? t('importForms:pick.supplierFallback'),
            })
          : t('catalog:material.importAttachWarehouse', { warehouse: importTarget.warehouse.name })
      }`
    : t('catalog:codeHintBusiness')

  return (
    <SheetScaffold
      testID="material-form-sheet"
      title={t(
        baseline
          ? 'catalog:material.title'
          : importTarget
            ? 'catalog:material.createForImport'
            : 'catalog:material.create',
      )}
      cancelLabel={t('common:cancel')}
      doneLabel={readOnly ? undefined : t(baseline ? 'catalog:save' : 'catalog:createAction')}
      onCancel={() => void leave()}
      onDone={readOnly ? undefined : () => void done()}
      doneState={doneState}
      doneDisabled={!dirty || invalid}
      grouped
    >
      <View style={{ gap: 16, paddingTop: 4 }}>
        {notFound ? <ErrorBox message={t('catalog:notFound')} /> : null}
        {submitError ? <ErrorBox message={submitError} /> : null}
        <FormGroup footer={codeFooter}>
          <FormInfoRow
            kind="input"
            first
            label={t('catalog:code')}
            value={texts.code}
            onChangeText={(s) => change('code', s)}
            onBlur={() => blur('code')}
            error={errorOf('code')}
            editable={editable}
            autoCapitalize="characters"
            code
            trailing={editable ? <ScanCodeButton onPress={openScan} /> : undefined}
          />
          <FormInfoRow
            kind="input"
            label={t('catalog:name')}
            value={texts.name}
            onChangeText={(s) => change('name', s)}
            onBlur={() => blur('name')}
            error={errorOf('name')}
            editable={editable}
          />
        </FormGroup>
        <FormGroup footer={locked ? t('catalog:material.baseUnitLocked') : undefined}>
          <FormInfoRow
            kind="picker"
            first
            required
            label={t('catalog:material.type')}
            value={refName(type)}
            onPress={() => openPick('type')}
            disabled={!editable}
            error={serverErrors.type}
          />
          {locked ? (
            <FormInfoRow
              kind="readonly"
              label={t('catalog:material.baseUnit')}
              value={refName(baseUnit)}
            />
          ) : (
            <FormInfoRow
              kind="picker"
              required
              label={t('catalog:material.baseUnit')}
              value={refName(baseUnit)}
              onPress={() => openPick('baseUnit')}
              disabled={!editable}
              error={serverErrors.baseUnit}
            />
          )}
        </FormGroup>
        {pickWarehouses ? (
          <FormGroup footer={t('catalog:material.warehousesHint')}>
            <FormInfoRow
              kind="picker"
              first
              label={t('catalog:material.warehouses')}
              value={
                warehouseSlugs.length === 0
                  ? t('catalog:material.warehousesNone')
                  : warehouseSlugs.length === 1
                    ? warehouseName(warehouseSlugs[0])
                    : t('catalog:material.warehousesCount', { count: warehouseSlugs.length })
              }
              onPress={openWarehouses}
              disabled={!editable}
            />
          </FormGroup>
        ) : null}
        {pickSuppliers ? (
          <FormGroup footer={t('catalog:material.suppliersHint')}>
            <FormInfoRow
              kind="picker"
              first
              label={t('catalog:material.suppliers')}
              value={
                supplierSlugs.length === 0
                  ? t('catalog:material.suppliersNone')
                  : supplierSlugs.length === 1
                    ? sellerName(supplierSlugs[0])
                    : t('catalog:material.suppliersCount', { count: supplierSlugs.length })
              }
              onPress={openSuppliers}
              disabled={!editable}
            />
          </FormGroup>
        ) : null}
        <FormGroup
          title={t('catalog:material.stockGroup')}
          footer={t('catalog:material.limitHint')}
        >
          <FormInfoRow
            kind="input"
            first
            label={t('catalog:material.minimum')}
            value={texts.min}
            onChangeText={(s) => change('min', s)}
            onBlur={() => blur('min')}
            error={serverErrors.min ?? (touched.min && errors.min ? errorOf('min') : undefined)}
            editable={editable}
            keyboardType="decimal-pad"
          />
          <FormInfoRow
            kind="input"
            label={t('catalog:material.maximum')}
            value={texts.max}
            onChangeText={(s) => change('max', s)}
            onBlur={() => blur('max')}
            error={maxError}
            editable={editable}
            keyboardType="decimal-pad"
          />
        </FormGroup>
      </View>
    </SheetScaffold>
  )
}
