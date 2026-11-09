import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Platform, RefreshControl, View } from 'react-native'

import {
  importFormAbilities,
  importFormErrorMessage,
  isImportFormNotFoundError,
  receiveMode,
  useImportForm,
  type ImportFormItem,
} from '@/entities/import-form'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  deriveHeaderSupplier,
  dropLocalDraft,
  importInfoRows,
  importItemAsLine,
  importLineSummary,
  peekLocalProgress,
  RECEIVE_CHECKLIST_ENABLED,
  type LocalProgress,
} from '@/features/receive-checklist'
import { WarehouseTransition } from '@/features/warehouse-picker'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { chooseAction } from '@/shared/lib/native-confirm'
import { useHandOffToModal } from '@/shared/lib/useHandOffToModal'
import { useLeaveOnWarehouseChange } from '@/shared/lib/useLeaveOnWarehouseChange'
import { useTheme } from '@/shared/theme/useTheme'
import {
  AndroidMoreButton,
  AttachmentRow,
  ErrorBanner,
  ErrorNotice,
  FirstLoadState,
  Screen,
} from '@/shared/ui'
import {
  ComposeSectionHeader,
  LineSummaryRow,
  ReviewInfoGroup,
  SummaryText,
  WizardBottomBar,
  WizardMainButton,
} from '@/shared/ui/compose'

import { ImportDetailHero } from './ImportDetailHero'
import { useImportDecision } from './useImportDecision'

/**
 * Tiến độ kiểm trên máy của phiếu (cho nhãn "Kiểm hàng · đã kiểm 3/6"): đọc lại mỗi lần màn được focus
 * (quay về từ màn kiểm). Chỉ đọc (`peekLocalProgress`), không nạp bản nháp. `formSlug` undefined = không
 * cần (phiếu không còn Nháp).
 */
function useLocalProgress(
  userSlug: string | null,
  warehouseSlug: string | undefined,
  formSlug: string | undefined,
): LocalProgress | null {
  const key =
    userSlug && warehouseSlug && formSlug ? `${userSlug}|${warehouseSlug}|${formSlug}` : null
  const [read, setRead] = useState<{ key: string; progress: LocalProgress | null } | null>(null)
  useFocusEffect(
    useCallback(() => {
      if (!key || !userSlug || !warehouseSlug || !formSlug) return
      let alive = true
      void peekLocalProgress({ userSlug, warehouseSlug, formSlug }).then((progress) => {
        if (alive) setRead({ key, progress })
      })
      return () => {
        alive = false
      }
    }, [key, userSlug, warehouseSlug, formSlug]),
  )
  // Kết quả của phiếu / kho / người khác (vừa đổi) không được hiện.
  return read && read.key === key ? read.progress : null
}

const byLineNo = (a: ImportFormItem, b: ImportFormItem) => a.lineNo - b.lineNo

/**
 * Xem một phiếu nhập (`/import/[formSlug]`, mọi trạng thái) — chỉ xem dữ liệu server (`useImportForm`),
 * không hiện phần kiểm trên máy. Đầu màn: nhãn trạng thái, NCC, tổng tiền, số dòng; nhóm "Thông tin";
 * nhóm "Vật tư · n" (dòng không bấm được). Phiếu Nháp, nút viên thuốc nổi ở đáy theo `receiveMode`:
 * xác nhận được → "Kiểm hàng" (kèm "· đã kiểm 3/6" khi trên máy đã kiểm dở) → checklist
 * `/import/[formSlug]/receive`, và nếu cũng sửa được thì thêm `⋯` trên header → "Sửa phiếu" → màn soạn
 * (modal `/import-form/[formSlug]/edit`); chỉ sửa được → "Sửa phiếu" → màn soạn; không sửa, không xác
 * nhận → không có nút. Đã xác nhận / đã huỷ: không có nút.
 *
 * `⋯` trên header gom các mục theo quyền: "Sửa phiếu" (khi nút đáy là "Kiểm hàng"), "Huỷ phiếu"
 * (`canCancel`, đỏ), "Xoá phiếu nháp" (`canDelete`, đỏ); không mục nào → không có `⋯`. Huỷ / xoá ở
 * `useImportDecision` (huỷ xong ở lại, xoá xong về danh sách); lỗi hiện ở vùng nổi đáy.
 *
 * `formSlug === 'new'` (link cũ, phiếu chưa có trên server) không có màn xem → bỏ màn này khỏi tab, mở
 * bước 1 `/import-form/new/info` (`useHandOffToModal`).
 */
export function ImportDetailScreen() {
  const { t, i18n } = useTranslation(['importForms', 'common'])
  const { colors } = useTheme()
  const router = useRouter()
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const isNew = formSlug === 'new'
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  useLeaveOnWarehouseChange(warehouseSlug)
  const user = useAuthStore((s) => s.user)
  const userSlug = user?.userSlug ?? null
  const locale = i18n.language === 'en' ? 'en' : 'vi'

  const handOff = useHandOffToModal()
  useEffect(() => {
    if (isNew) handOff('/import-form/new/info')
  }, [isNew, handOff])

  const query = useImportForm(warehouseSlug, isNew ? undefined : formSlug)
  // Phiếu bị xoá (tải lại sau khi màn kiểm rời đi vì phiếu không còn): không hiện bản cũ trong cache.
  const gone = isImportFormNotFoundError(query.error)
  const form = gone ? undefined : query.data
  // Lỗi lần đầu rồi Thử lại: query về `pending` và xoá `error` — giữ màn lỗi thay vì nháy vòng quay.
  const [lastError, setLastError] = useState<unknown>(null)
  if (query.error && query.error !== lastError) setLastError(query.error)
  const failedFirstLoad = !form && query.errorUpdateCount > 0 && (gone || !query.isSuccess)

  // Nút theo quyền trên phiếu (phiếu không còn Nháp → mọi quyền false, 'view', không có nút).
  const abilities = useMemo(
    () =>
      user && form
        ? importFormAbilities({ can: (c) => can(user, c), userSlug: user.userSlug ?? null }, form)
        : null,
    [user, form],
  )
  const mode = abilities ? receiveMode(abilities) : 'view'
  // "· đã kiểm 3/6" chỉ có nghĩa với checklist (dấu kiểm trên máy).
  const progress = useLocalProgress(
    userSlug,
    warehouseSlug,
    mode === 'check' ? formSlug : undefined,
  )

  // Phiếu đã xác nhận / huỷ ở nơi khác hoặc bị xoá: không còn đường mở màn kiểm (nơi tự dọn bản nháp)
  // → màn xem bỏ bản nháp trên máy của nó. CHỈ khi màn xem đang focus: nếu màn kiểm đang ở trên, để nó
  // tự `load` → `discard` và báo "không còn Nháp" (xoá trước thì nó không biết đã có phần kiểm dở).
  const stale = gone || (!!form && form.status !== 'DRAFT')
  useFocusEffect(
    useCallback(() => {
      if (!stale || isNew || !userSlug || !warehouseSlug || !formSlug) return
      void dropLocalDraft({ userSlug, warehouseSlug, formSlug })
    }, [stale, isNew, userSlug, warehouseSlug, formSlug]),
  )

  const items = useMemo(() => [...(form?.items ?? [])].sort(byLineNo), [form?.items])
  /** Dòng chỉ đọc: cùng nội dung dòng của bước 2/3 form. */
  const lines = useMemo(
    () =>
      form
        ? items.map((item) => ({
            item,
            summary: importLineSummary(importItemAsLine(item), {
              formDate: form.date,
              t,
              locale,
            }),
          }))
        : [],
    [items, form, t, locale],
  )
  const supplierName = useMemo(() => {
    const slug = deriveHeaderSupplier(items.map((i) => i.supplierSlug))
    return slug === null ? null : (items.find((i) => i.supplierSlug === slug)?.supplierName ?? null)
  }, [items])

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [pulling, setPulling] = useState(false)
  const { refetch } = query
  const retry = useCallback(() => void refetch({ cancelRefetch: false }), [refetch])
  const onRefresh = useCallback(async () => {
    setPulling(true)
    try {
      await refetch({ cancelRefetch: false })
    } finally {
      if (mounted.current) setPulling(false)
    }
  }, [refetch])

  /** Chiều cao phần nội dung của vùng nổi ở đáy (đo bằng onLayout). */
  const [dockHeight, setDockHeight] = useState(0)
  const openReceive = () =>
    router.push({ pathname: '/import/[formSlug]/receive', params: { formSlug } })
  const openCompose = useCallback(
    () => router.navigate({ pathname: '/import-form/[formSlug]/edit', params: { formSlug } }),
    [router, formSlug],
  )
  const decision = useImportDecision({ form, warehouseSlug, userSlug })
  const { cancel, remove, pending: deciding } = decision
  // Thông báo mức phiếu (lỗi Huỷ / Xoá) ở store dùng chung như form 3 bước: chỉ của đúng phiếu này.
  const formNotice = useFormNotice((s) =>
    s.notice && s.notice.kind === 'import' && s.notice.formSlug === formSlug ? s.notice : null,
  )
  const dismissNotice = useCallback(
    () => useFormNotice.getState().dismiss('import', formSlug),
    [formSlug],
  )
  // Rời màn: bỏ thông báo của phiếu này (của phiếu khác giữ nguyên).
  useEffect(() => dismissNotice, [dismissNotice])

  // Mục của `⋯` — giống `⋯` của form 3 bước: iOS menu thả xuống GỐC (UIMenu; màn này không có dòng bấm
  // được nên chạm đóng menu không lọt xuống đâu), Android hộp chọn gốc. "Sửa phiếu" chỉ khi nút chính là
  // "Kiểm hàng" (người chỉ sửa được đã có "Sửa phiếu" ở đáy). Huỷ / xoá: hỏi lại rồi mới gửi.
  const moreActions = useMemo(() => {
    const actions: { key: string; label: string; destructive?: boolean; run: () => void }[] = []
    if (mode === 'check' && abilities?.canEdit) {
      actions.push({ key: 'edit', label: t('importForms:view.edit'), run: openCompose })
    }
    if (abilities?.canCancel) {
      actions.push({
        key: 'cancel',
        label: t('importForms:manage.cancelItem'),
        destructive: true,
        run: cancel,
      })
    }
    if (abilities?.canDelete) {
      actions.push({
        key: 'delete',
        label: t('importForms:manage.deleteItem'),
        destructive: true,
        run: remove,
      })
    }
    return actions
  }, [mode, abilities, t, openCompose, cancel, remove])
  const showMore = moreActions.length > 0
  const openMore = useCallback(async () => {
    if (deciding) return
    const i = await chooseAction({
      actions: moreActions.map(({ label, destructive }) =>
        destructive ? { label, destructive } : { label },
      ),
      cancelLabel: t('common:cancel'),
    })
    if (i !== null) moreActions[i]?.run()
  }, [deciding, moreActions, t])
  const headerOptions = useMemo(() => {
    const moreLabel = t('importForms:receive.menu.more')
    return {
      title: form?.code ?? '',
      ...(showMore
        ? Platform.OS === 'ios'
          ? {
              unstable_headerRightItems: () => [
                {
                  type: 'menu' as const,
                  label: moreLabel,
                  accessibilityLabel: moreLabel,
                  icon: { type: 'sfSymbol' as const, name: 'ellipsis' as const },
                  disabled: deciding,
                  menu: {
                    items: moreActions.map((a) => ({
                      type: 'action' as const,
                      label: a.label,
                      ...(a.destructive ? { destructive: true } : null),
                      disabled: deciding,
                      onPress: a.run,
                    })),
                  },
                },
              ],
            }
          : {
              headerRight: () => (
                <AndroidMoreButton label={moreLabel} onPress={() => void openMore()} />
              ),
            }
        : null),
    }
  }, [form?.code, showMore, moreActions, deciding, openMore, t])
  const dockLabel =
    mode === 'edit'
      ? t('importForms:view.edit')
      : !RECEIVE_CHECKLIST_ENABLED
        ? t('importForms:view.review')
        : progress && progress.checked > 0
          ? t('importForms:view.checkProgress', {
              checked: progress.checked,
              total: progress.total,
            })
          : t('importForms:view.check')
  const showMain = mode !== 'view'
  const hasDock = showMain || !!formNotice

  const infoRows = useMemo(() => {
    if (!form) return []
    const rows = importInfoRows(form, { supplierName, t, noteLines: 3 })
    rows.push({
      key: 'requester',
      label: t('importForms:view.requester'),
      value: form.requesterName,
    })
    const approverLabel =
      form.status === 'CONFIRMED'
        ? t('importForms:fieldConfirmedBy')
        : form.status === 'CANCELLED'
          ? t('importForms:fieldCancelledBy')
          : null
    if (approverLabel && form.approverName) {
      rows.push({ key: 'approver', label: approverLabel, value: form.approverName })
    }
    return rows
  }, [form, supplierName, t])

  const listHeader = form ? (
    <View style={{ gap: 18, paddingBottom: 18 }}>
      {query.isRefetchError ? (
        <ErrorBanner
          message={t('importForms:view.refreshError')}
          retryLabel={t('common:retry')}
          busy={query.isFetching}
          onRetry={retry}
        />
      ) : null}
      <ImportDetailHero
        form={form}
        supplierName={supplierName}
        lineCount={items.length}
        locale={locale}
      />
      <View>
        <ComposeSectionHeader title={t('importForms:view.info')} />
        <ReviewInfoGroup rows={infoRows} testID="import-info" />
        {form.file ? (
          <View style={{ marginTop: 8 }}>
            <AttachmentRow
              testID="import-attachment"
              value={form.file}
              label={t('importForms:fieldFile')}
            />
          </View>
        ) : null}
      </View>
      <ComposeSectionHeader title={t('importForms:view.items', { n: items.length })} />
    </View>
  ) : undefined

  const body = form ? (
    <FlatList
      testID="import-detail-list"
      data={lines}
      keyExtractor={(l) => l.item.slug}
      renderItem={({ item: { item, summary }, index }) => (
        <LineSummaryRow
          testID={`import-item-${item.slug}`}
          icon="import"
          warning={summary.missing}
          title={item.materialName}
          amount={<SummaryText segments={[{ text: summary.amount, tone: summary.amountTone }]} />}
          line2={<SummaryText segments={[{ text: summary.line2, tone: summary.line2Tone }]} />}
          line3={<SummaryText segments={summary.line3} />}
          first={index === 0}
          last={index === lines.length - 1}
          accessibilityLabel={summary.a11y}
        />
      )}
      ListHeaderComponent={listHeader}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      contentInsetAdjustmentBehavior="automatic"
      // Chừa đáy theo chiều cao THẬT của vùng nổi để dòng cuối cuộn lên khỏi nút.
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: (hasDock ? dockHeight : 0) + 16,
      }}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={() => void onRefresh()}
          tintColor={colors.mutedForeground}
        />
      }
    />
  ) : (
    <FirstLoadState
      failed={failedFirstLoad}
      errorTitle={t('importForms:receive.loadError')}
      errorMessage={importFormErrorMessage(query.error ?? lastError, t)}
      loadingLabel={t('importForms:receive.loading')}
      fetching={query.isFetching}
      onRetry={retry}
    />
  )

  return (
    <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
      <Stack.Screen options={headerOptions} />
      <WarehouseTransition style={{ flex: 1 }}>{body}</WarehouseTransition>
      {form && hasDock ? (
        <WizardBottomBar
          testID="import-detail-dock"
          onHeight={setDockHeight}
          notice={
            formNotice ? (
              // Nền thẻ đặc dưới nền đỏ nhạt để chữ không lẫn với nội dung bên dưới.
              <View style={{ borderRadius: 12, backgroundColor: colors.card }}>
                <ErrorNotice
                  testID="import-detail-error"
                  message={formNotice.message}
                  onDismiss={dismissNotice}
                  dismissLabel={t('importForms:receive.actions.dismiss')}
                />
              </View>
            ) : null
          }
        >
          {showMain ? (
            <WizardMainButton
              disabled={deciding}
              onPress={mode === 'edit' ? openCompose : openReceive}
            >
              {dockLabel}
            </WizardMainButton>
          ) : null}
        </WizardBottomBar>
      ) : null}
    </Screen>
  )
}
