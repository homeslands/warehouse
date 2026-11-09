import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Platform, RefreshControl, View } from 'react-native'

import {
  exportFormAbilities,
  exportFormErrorMessage,
  formatLotLabel,
  isExportFormNotFoundError,
  useExportForm,
  type ExportFormItem,
} from '@/entities/export-form'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  exportInfoRows,
  exportItemAsLine,
  exportLineSummary,
  useLotInfo,
} from '@/features/export-draft'
import { WarehouseTransition } from '@/features/warehouse-picker'
import { formatFullDate, formatTime } from '@/shared/lib/format'
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
  Text,
} from '@/shared/ui'
import {
  ComposeSectionHeader,
  LineSummaryRow,
  ReviewInfoGroup,
  SummaryText,
  WizardBottomBar,
  WizardMainButton,
  WizardSideButton,
  type ReviewInfoRowData,
} from '@/shared/ui/compose'

import { ExportDetailHero } from './ExportDetailHero'
import { useExportDecision } from './useExportDecision'

const byLineNo = (a: ExportFormItem, b: ExportFormItem) => a.lineNo - b.lineNo

/**
 * Xem một phiếu xuất (`/export/[formSlug]`, mọi trạng thái). Đầu màn: viên trạng thái + loại, người
 * nhận, tổng tiền, số dòng; nhóm "Thông tin"; nhóm "Vật tư · n" (dòng không bấm được, viên lô
 * "HSD … · nhập …" khi dòng đã có lô). Đáy (nút nổi) theo quyền + trạng thái: Chờ duyệt → [Huỷ] [Xác
 * nhận xuất kho] (xuất huỷ thiếu quyền duyệt → Xác nhận khoá + lý do); Nháp sửa được → "Sửa phiếu"
 * (màn sửa ở modal `/export-form/[formSlug]/edit`); Nháp huỷ được → `⋯` trên header (nút gốc, KHÔNG UIMenu — lỗi
 * chạm lọt xuống dòng) → "Huỷ phiếu"; Đã xuất / Đã huỷ → không nút. "Xoá" nháp chỉ ở màn sửa.
 *
 * `formSlug === 'new'` (link cũ, phiếu chưa có trên server) không có màn xem → bỏ màn này khỏi tab, mở
 * bước 1 của phiếu mới `/export-form/new/info` (`useHandOffToModal`).
 */
export function ExportDetailScreen() {
  const { t, i18n } = useTranslation(['exportForms', 'common'])
  const { colors } = useTheme()
  const router = useRouter()
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const isNew = formSlug === 'new'
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  useLeaveOnWarehouseChange(warehouseSlug)
  const user = useAuthStore((s) => s.user)
  const locale = i18n.language === 'en' ? 'en' : 'vi'

  const handOff = useHandOffToModal()
  useEffect(() => {
    if (isNew) handOff('/export-form/new/info')
  }, [isNew, handOff])

  const query = useExportForm(warehouseSlug, isNew ? undefined : formSlug)
  // Phiếu bị xoá (tải lại → 101401): không hiện bản cũ trong cache.
  const gone = isExportFormNotFoundError(query.error)
  const form = gone ? undefined : query.data
  // Lỗi lần đầu rồi Thử lại: query về `pending` và xoá `error` — giữ màn lỗi thay vì nháy vòng quay.
  const [lastError, setLastError] = useState<unknown>(null)
  if (query.error && query.error !== lastError) setLastError(query.error)
  const failedFirstLoad = !form && query.errorUpdateCount > 0 && (gone || !query.isSuccess)

  const abilities = useMemo(
    () =>
      user && form
        ? exportFormAbilities({ can: (c) => can(user, c), userSlug: user.userSlug ?? null }, form)
        : null,
    [user, form],
  )

  const items = useMemo(() => [...(form?.items ?? [])].sort(byLineNo), [form?.items])
  const lots = useLotInfo(warehouseSlug, form?.items)
  const lotLabelOf = useCallback(
    (item: ExportFormItem): string | null =>
      item.batchSlug === null
        ? null
        : formatLotLabel(
            { expiryDate: item.batchExpiryDate, entryDate: lots.get(item.batchSlug)?.entryDate },
            new Date(),
            locale,
          ),
    [lots, locale],
  )

  /** Dòng chỉ đọc: cùng nội dung dòng của bước 2/3 form (không "còn n", không đơn vị gốc). */
  const lines = useMemo(
    () =>
      form
        ? items.map((item) => ({
            item,
            summary: exportLineSummary(exportItemAsLine(item), {
              available: null,
              baseUnitName: null,
              // Nháp: dòng chưa gán lô sẽ tự chọn lô khi gửi duyệt → "Lô tự động"; phiếu đã giữ hàng /
              // đã xuất / đã huỷ không còn nghĩa "tự động" → không đoạn lô.
              lotLabel: form.status === 'DRAFT' ? lotLabelOf(item) : (lotLabelOf(item) ?? false),
              t,
              locale,
            }),
          }))
        : [],
    [items, form, lotLabelOf, t, locale],
  )

  const infoRows = useMemo(() => {
    if (!form) return []
    const rows: ReviewInfoRowData[] = exportInfoRows(form, { t, noteLines: 3 })
    rows.push({
      key: 'requester',
      label: t('exportForms:view.requester'),
      value: form.requesterName,
    })
    const approverLabel =
      form.status === 'CONFIRMED'
        ? t('exportForms:view.confirmedBy')
        : form.status === 'CANCELLED'
          ? t('exportForms:view.cancelledBy')
          : null
    if (approverLabel && form.approverName) {
      rows.push({ key: 'approver', label: approverLabel, value: form.approverName })
    }
    const time = formatTime(form.createdAt)
    rows.push({
      key: 'createdAt',
      label: t('exportForms:view.createdAt'),
      value: time ? `${formatFullDate(form.createdAt)} ${time}` : formatFullDate(form.createdAt),
      format: 'numeric',
    })
    return rows
  }, [form, t])

  const decision = useExportDecision(warehouseSlug, form)
  // Thông báo mức phiếu (lỗi Xác nhận / Huỷ) ở store dùng chung như form 3 bước: chỉ của đúng phiếu này.
  const formNotice = useFormNotice((s) =>
    s.notice && s.notice.kind === 'export' && s.notice.formSlug === formSlug ? s.notice : null,
  )
  const dismissNotice = useCallback(
    () => useFormNotice.getState().dismiss('export', formSlug),
    [formSlug],
  )
  // Rời màn: bỏ thông báo của phiếu này (của phiếu khác giữ nguyên).
  useEffect(() => dismissNotice, [dismissNotice])

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

  // Nút ở đáy / header theo quyền (đã gồm trạng thái).
  const showEdit = !!abilities?.canEdit
  const showDecision =
    !!abilities &&
    (abilities.canCancel || abilities.canConfirm || abilities.confirmBlockedByDisposal) &&
    form?.status === 'PENDING'
  // Nháp huỷ được: `⋯` trên header (phiếu Chờ duyệt đã có nút Huỷ ở đáy) — giống `⋯` của form 3 bước:
  // iOS menu thả xuống GỐC [Huỷ phiếu (đỏ)] (màn này không có dòng bấm được nên chạm đóng menu không lọt
  // xuống đâu), Android hộp chọn gốc; chọn "Huỷ phiếu" mới hỏi lại rồi huỷ.
  const showMore = !!abilities?.canCancel && form?.status === 'DRAFT'
  const hasDock = showEdit || showDecision || !!formNotice

  const { cancel, pending: deciding } = decision
  const moreLabel = t('exportForms:edit.menu.more')
  const cancelLabel = t('exportForms:view.cancelForm')
  const openMore = useCallback(async () => {
    const i = await chooseAction({
      actions: [{ label: cancelLabel, destructive: true }],
      cancelLabel: t('common:cancel'),
    })
    if (i === 0) cancel()
  }, [cancelLabel, cancel, t])
  const headerOptions = useMemo(
    () => ({
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
                    items: [
                      {
                        type: 'action' as const,
                        label: cancelLabel,
                        destructive: true,
                        disabled: deciding,
                        onPress: cancel,
                      },
                    ],
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
    }),
    [form?.code, showMore, moreLabel, cancelLabel, deciding, cancel, openMore],
  )

  /** Chiều cao phần nội dung của vùng nổi ở đáy (đo bằng onLayout). */
  const [dockHeight, setDockHeight] = useState(0)

  const listHeader = form ? (
    <View style={{ gap: 18, paddingBottom: 18 }}>
      {query.isRefetchError ? (
        <ErrorBanner
          message={t('exportForms:view.refreshError')}
          retryLabel={t('common:retry')}
          busy={query.isFetching}
          onRetry={retry}
        />
      ) : null}
      <ExportDetailHero form={form} lineCount={items.length} locale={locale} />
      <View>
        <ComposeSectionHeader title={t('exportForms:view.info')} />
        <ReviewInfoGroup rows={infoRows} testID="export-info" />
        {form.file ? (
          <View style={{ marginTop: 8 }}>
            <AttachmentRow
              testID="export-attachment"
              value={form.file}
              label={t('exportForms:fields.file')}
            />
          </View>
        ) : null}
      </View>
      <ComposeSectionHeader title={t('exportForms:view.items', { n: items.length })} />
    </View>
  ) : undefined

  const body = form ? (
    <FlatList
      testID="export-detail-list"
      data={lines}
      keyExtractor={(l) => l.item.slug}
      renderItem={({ item: { item, summary }, index }) => (
        <LineSummaryRow
          testID={`export-item-${item.slug}`}
          icon="export"
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
      errorTitle={t('exportForms:edit.loadError')}
      errorMessage={exportFormErrorMessage(query.error ?? lastError, t)}
      loadingLabel={t('exportForms:edit.loading')}
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
          testID="export-detail-dock"
          onHeight={setDockHeight}
          notice={
            formNotice ? (
              // Nền thẻ đặc dưới nền đỏ nhạt để chữ không lẫn với nội dung bên dưới.
              <View style={{ borderRadius: 12, backgroundColor: colors.card }}>
                <ErrorNotice
                  testID="export-detail-error"
                  message={formNotice.message}
                  onDismiss={dismissNotice}
                  dismissLabel={t('exportForms:edit.actions.dismiss')}
                />
              </View>
            ) : null
          }
          summary={
            abilities?.confirmBlockedByDisposal ? (
              <Text muted size={13} style={{ textAlign: 'center' }}>
                {t('exportForms:view.needDisposalApproval')}
              </Text>
            ) : null
          }
        >
          {showEdit ? (
            <WizardMainButton
              disabled={deciding}
              onPress={() =>
                router.navigate({ pathname: '/export-form/[formSlug]/edit', params: { formSlug } })
              }
            >
              {t('exportForms:view.edit')}
            </WizardMainButton>
          ) : null}
          {showDecision ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {abilities?.canCancel ? (
                <WizardSideButton
                  variant="secondaryDestructive"
                  disabled={deciding}
                  loading={decision.busy === 'cancel'}
                  style={{ flex: 1 }}
                  onPress={decision.cancel}
                >
                  {t('exportForms:view.cancel')}
                </WizardSideButton>
              ) : null}
              <View style={{ flex: 2 }}>
                <WizardMainButton
                  disabled={deciding || !abilities?.canConfirm}
                  loading={decision.busy === 'confirm'}
                  onPress={decision.confirm}
                >
                  {t('exportForms:view.confirm')}
                </WizardMainButton>
              </View>
            </View>
          ) : null}
        </WizardBottomBar>
      ) : null}
    </Screen>
  )
}
