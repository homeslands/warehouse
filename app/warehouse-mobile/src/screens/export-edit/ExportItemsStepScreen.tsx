import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, RefreshControl, View } from 'react-native'

import { formatLotLabel } from '@/entities/export-form'
import { useInventory } from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  availableInLineUnit,
  exportLineSummary,
  linesTotal,
  MAX_ITEMS,
  useExportDraft,
  useLotInfo,
  type ExportLine,
} from '@/features/export-draft'
import { WarehouseTransition } from '@/features/warehouse-picker'
import { formatMoney } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { lineGaps, missingForStep, type MissingTarget } from '@/shared/lib/missing'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useComposeLineOpen } from '@/shared/lib/useComposeLineOpen'
import { canEnterStep3, stepStatus } from '@/shared/lib/wizard-steps'
import { useTheme } from '@/shared/theme/useTheme'
import { ErrorBanner, Screen, Text } from '@/shared/ui'
import {
  AddLineRow,
  ComposeSectionHeader,
  LineSummaryRow,
  SummaryText,
  SwipeToDelete,
  closeOpenSwipeRow,
  WizardBottomBar,
  WizardHeader,
  WizardMainButton,
  WizardProgress,
} from '@/shared/ui/compose'

import { ExportStepLoadState, ExportStepNotices } from './ExportStepParts'
import { useExportWizardLabels } from './useExportWizardLabels'
import { exportMissingLabel } from './export-missing'
import { useExportScanNotice } from './scan-notice.store'
import { exportWizardLeave, useExportActions } from './useExportActions'
import { useExportDraftMenu } from './useExportDraftMenu'
import { useExportStepNotices } from './useExportStepNotices'
import { useExportWizardDraft } from './useExportWizardDraft'

const clearScanNotice = () => useExportScanNotice.getState().clear()

/**
 * Bước 2 "Vật tư" của phiếu xuất (modal `/export-form/[formSlug]/edit`, spec form-wizard §5,
 * wizard-apple §3–4, §6): header trái theo vị trí trong modal — màn đầu modal (vd "Sửa phiếu" mở thẳng
 * bước 2) ✕ đóng modal, màn được đẩy lên ‹ (back gốc — lùi một bước); "Phiếu
 * xuất mới" / "Sửa phiếu" + "Bước 2/3 · Vật tư" [quét] [⋯ — Lưu nháp / Bỏ / Xoá nháp]; vạch tiến độ + MỘT
 * khối nhóm "Vật tư · n": mỗi vật tư một dòng CHỈ ĐỌC (`LineSummaryRow` trong `SwipeToDelete`, chạm → sheet
 * sửa dòng `/export-line`), dòng cuối "⊕ Thêm vật tư"; trống → khối chỉ có "⊕ Thêm vật tư" + câu xám; thanh
 * đáy có nền: [thông báo mức phiếu] [tóm tắt "n vật tư · k chưa đủ" (chạm phần cam → sheet của dòng thiếu
 * đầu tiên) + tổng tiền] [gợi ý "Thông tin phiếu còn thiếu" → bước 1] ["Tiếp tục" → bước 3]. Dòng vừa thêm
 * (bộ chọn) / vừa quét → sheet của dòng đó tự mở (`useComposeLineOpen`). Nạp / gác quyền bản nháp ở
 * `useExportWizardDraft` (dùng chung mọi bước).
 */
export function ExportItemsStepScreen() {
  const { t, i18n } = useTranslation(['exportForms', 'common'])
  const wizardLabels = useExportWizardLabels(2)
  const { colors } = useTheme()
  const router = useRouter()
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const locale = i18n.language === 'en' ? 'en' : 'vi'
  const wizard = useExportWizardDraft(formSlug)
  const { ready, draft, form, abilities, ctx, isNew, saving, step1Ok, step2Ok, missing, nav } =
    wizard
  const { query } = wizard
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const leave = useMemo(() => exportWizardLeave(nav), [nav])
  const actions = useExportActions({ ctx, form, abilities, leave })
  const { busy } = actions
  const writing = busy !== null || saving
  const lines: ExportLine[] | null = ready && draft ? draft.lines : null
  const total = useMemo(() => linesTotal(lines ?? []), [lines])

  // Mã quét trong phiếu không khớp dòng / vật tư nào (sheet `/scan-export-line` ghi, xem scan-notice.store).
  const scan = useExportScanNotice((s) => (s.notice?.formSlug === formSlug ? s.notice : null))
  const scanNotice = scan
    ? scan.reason === 'full'
      ? t('exportForms:edit.scanFull', { code: scan.code, max: MAX_ITEMS })
      : scan.reason === 'noUnit'
        ? t('exportForms:edit.scanNoUnit', { code: scan.code })
        : t('exportForms:edit.scanNotFound', { code: scan.code })
    : null
  // (Lưu nháp trùng mã: `useExportActions` về bước 1 — lỗi hiện dưới ô Mã phiếu ở đó.)
  const extra = useMemo(() => ({ message: scanNotice, dismiss: clearScanNotice }), [scanNotice])
  const notices = useExportStepNotices(formSlug, extra)
  // Rời màn thì bỏ thông báo quét (không để nó hiện lại ở phiếu khác).
  useEffect(() => clearScanNotice, [])

  // "còn n": tồn của kho (dòng lô tự động) + thông tin lô (dòng chọn lô; cũng cho ngày nhập của nhãn).
  const inventory = useInventory(warehouseSlug)
  const stockBySlug = useMemo(
    () => new Map((inventory.data ?? []).map((i) => [i.materialSlug, i])),
    [inventory.data],
  )
  const lots = useLotInfo(warehouseSlug, lines ?? undefined)

  // Sheet sửa dòng: chạm dòng / phần thiếu → mở thường; dòng vừa thêm / vừa quét (yêu cầu `useLineFocus`
  // của bộ chọn / sheet quét) → tự mở MỘT lần khi màn được focus lại, ô số focus sẵn.
  const { openLine } = useComposeLineOpen({
    kind: 'export',
    formSlug,
    href: (key, { justAdded }) => {
      const state = useExportDraft.getState()
      if (state.saving || !state.draft?.lines.some((l) => l.key === key)) return null
      return {
        pathname: '/export-line',
        params: justAdded ? { key, focus: 'quantity' } : { key },
      }
    },
  })
  /** Vuốt xoá: dòng có sẵn trên server → hỏi lại; dòng mới thêm trên máy → xoá ngay (spec §5.2). */
  const swipeDelete = useCallback(
    async (line: ExportLine, out: () => Promise<void>) => {
      if (useExportDraft.getState().saving) return
      if (line.base) {
        const ok = await confirmAction({
          title: t('exportForms:wizard.removeTitle', { name: line.materialName }),
          confirmLabel: t('common:compose.delete'),
          cancelLabel: t('common:cancel'),
          destructive: true,
        })
        if (!ok) return
      }
      haptics.selection()
      // Thẻ trượt ra + chỗ trống co lại XONG mới gỡ dòng (không nhảy danh sách).
      await out()
      if (useExportDraft.getState().saving) return
      useExportDraft.getState().removeLine(line.key)
    },
    [t],
  )

  const openScan = useCallback(() => {
    router.navigate('/scan-export-line')
    // `router` đổi định danh mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openAdd = useCallback(() => {
    router.navigate('/export-add-line')
    // `router` đổi định danh mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phần còn thiếu của bước 2: mỗi dòng thiếu tính MỘT lần ("k chưa đủ", theo thứ tự danh sách), cộng
  // mục không thuộc dòng nào ("Chưa có vật tư", "Quá 200 dòng").
  const gaps = useMemo(() => missingForStep(missing, 2), [missing])
  const { incomplete, other } = useMemo(
    () =>
      lineGaps(
        gaps,
        (lines ?? []).map((l) => l.key),
      ),
    [gaps, lines],
  )
  const duplicates = useMemo(
    () =>
      new Set(
        gaps.flatMap((g) =>
          g.group === 'duplicate' && g.target.kind === 'line' ? [g.target.key] : [],
        ),
      ),
    [gaps],
  )
  const gapText = useMemo(() => {
    const label = exportMissingLabel(t)
    const counts = new Map<string, number>()
    for (const g of other) counts.set(g.group, (counts.get(g.group) ?? 0) + 1)
    return [
      ...(incomplete.length > 0
        ? [t('exportForms:wizard.incomplete', { count: incomplete.length })]
        : []),
      ...[...counts].map(([group, n]) => label(group, n)),
    ].join(', ')
  }, [incomplete, other, t])
  const goTo = useCallback(
    (target: MissingTarget) => {
      if (target.kind === 'lines') openAdd()
      else if (target.kind === 'line') openLine(target.key)
    },
    [openAdd, openLine],
  )
  /** Tới chỗ thiếu ĐẦU TIÊN của bước 2: sheet của dòng thiếu đầu tiên, không thì mục khác. `false` = đủ. */
  // Gợi ý a11y của phần cam = việc `toFirstGap` sẽ làm (chưa có dòng → mở bộ chọn, không phải "mở dòng").
  const gapHint = t(
    !incomplete[0] && other[0]?.target.kind === 'lines'
      ? 'exportForms:wizard.goToAdd'
      : 'exportForms:wizard.goToMissing',
  )
  const toFirstGap = () => {
    if (incomplete[0]) openLine(incomplete[0])
    else if (other[0]) goTo(other[0].target)
    else return false
    return true
  }

  // "Lưu nháp" (mục của ⋯; luật bật ở `useExportDraftMenu`) = "Lưu" hiện có của `useExportActions`.
  const { save: saveDraft } = actions
  const pressSave = useCallback(() => void saveDraft(), [saveDraft])
  const menuItems = useExportDraftMenu({
    wizard,
    remove: actions.remove,
    save: pressSave,
    writing,
    onDiscarded: notices.dismiss,
  })

  const status = useMemo(
    () => stepStatus({ current: 2, step1Ok, step2Ok, existing: !isNew }),
    [step1Ok, step2Ok, isNew],
  )
  const progressSteps = useMemo(
    () => status.map((s, i) => ({ ...s, label: wizardLabels.steps[i] ?? '' })),
    [status, wizardLabels.steps],
  )
  const { goToStep } = nav
  const canNext = canEnterStep3(step1Ok, step2Ok)
  // "Tiếp tục" TRÔNG như khoá khi chưa vào được bước 3 nhưng vẫn bấm được: bấm → rung lỗi + sheet của dòng
  // thiếu đầu tiên (chưa có dòng → bộ chọn); chỉ bước 1 thiếu → về bước 1. Đủ → bước 3.
  const nextHint = !canNext
    ? gapText
      ? t('exportForms:wizard.stillMissing', { fields: gapText })
      : t('exportForms:wizard.infoMissing')
    : undefined
  const onNext = () => {
    if (canNext) {
      goToStep(3)
      return
    }
    haptics.error()
    if (!toFirstGap() && !step1Ok) goToStep(1)
  }

  const [pulling, setPulling] = useState(false)
  const [dockHeight, setDockHeight] = useState(0)
  const { refetch } = query
  const retry = useCallback(() => {
    if (!useExportDraft.getState().saving) void refetch({ cancelRefetch: false })
  }, [refetch])
  const refetchInventory = inventory.refetch
  const onRefresh = useCallback(async () => {
    if (useExportDraft.getState().saving) return
    setPulling(true)
    try {
      await Promise.all([
        isNew ? null : refetch({ cancelRefetch: false }),
        refetchInventory({ cancelRefetch: false }),
      ])
    } finally {
      if (mounted.current) setPulling(false)
    }
  }, [refetch, refetchInventory, isNew])

  // Thiếu hàng (lần gửi duyệt / Lưu lỗi thiếu hàng, ở bất kỳ bước nào): dòng của thông báo mức phiếu.
  const { shortages } = notices
  // FlatList chỉ vẽ lại dòng khi `data`/`extraData` đổi: khoá khi ghi, thiếu hàng, tồn / lô, trùng phải qua đây.
  const rowState = useMemo(
    () => ({ writing, shortages, stockBySlug, lots, duplicates }),
    [writing, shortages, stockBySlug, lots, duplicates],
  )
  const now = new Date()

  const listHeader = (
    <View style={{ gap: 12 }}>
      {/* Vạch tiến độ = phần tử ĐẦU của vùng cuộn (không bao giờ nằm dưới header trong suốt). */}
      <WizardProgress
        testID="export-wizard-steps-2"
        steps={progressSteps}
        writing={writing}
        onPress={(i) => goToStep((i + 1) as 1 | 2 | 3)}
      />
      {query.isRefetchError ? (
        <ErrorBanner
          message={t('exportForms:view.refreshError')}
          retryLabel={t('common:retry')}
          busy={query.isFetching}
          onRetry={retry}
        />
      ) : null}
      {/* Tiêu đề khối nhóm (quét mã nằm trên header — spec wizard-apple §3). */}
      <ComposeSectionHeader title={t('exportForms:wizard.itemsGroup', { n: lines?.length ?? 0 })} />
    </View>
  )
  const listFooter = (
    <View>
      {/* "⊕ Thêm vật tư" là thẻ riêng như mỗi vật tư (cách thẻ trên 10). */}
      <View>
        <AddLineRow
          testID="export-items-add"
          label={t('exportForms:wizard.add')}
          onPress={openAdd}
          disabled={writing}
          first
        />
      </View>
      {lines?.length === 0 ? (
        <View testID="export-items-empty" style={{ paddingTop: 12, paddingHorizontal: 18 }}>
          <Text muted size={13}>
            {t('exportForms:wizard.empty')}
          </Text>
        </View>
      ) : null}
    </View>
  )

  const body =
    ready && lines ? (
      <FlatList
        testID="export-items-list"
        data={lines}
        keyExtractor={(l) => l.key}
        extraData={rowState}
        renderItem={({ item }) => {
          const summary = exportLineSummary(item, {
            available: availableInLineUnit(
              item,
              rowState.stockBySlug.get(item.materialSlug),
              item.batchSlug === null ? undefined : rowState.lots.get(item.batchSlug),
              lines,
            ),
            lotLabel:
              item.batchSlug === null
                ? null
                : formatLotLabel(
                    {
                      expiryDate: item.batchExpiryDate,
                      entryDate: rowState.lots.get(item.batchSlug)?.entryDate,
                    },
                    now,
                    locale,
                  ),
            shortage: rowState.shortages.get(item.key),
            baseUnitName: rowState.stockBySlug.get(item.materialSlug)?.baseUnit?.name ?? null,
            duplicate: rowState.duplicates.has(item.key),
            t,
            locale,
          })
          return (
            <SwipeToDelete
              label={t('common:compose.delete')}
              enabled={!rowState.writing}
              onDelete={(out) => swipeDelete(item, out)}
              spacing={CARD_GAP}
            >
              <LineSummaryRow
                testID={`export-line-${item.key}`}
                icon="export"
                warning={summary.missing}
                title={item.materialName}
                amount={
                  <SummaryText segments={[{ text: summary.amount, tone: summary.amountTone }]} />
                }
                line2={
                  <SummaryText segments={[{ text: summary.line2, tone: summary.line2Tone }]} />
                }
                line3={<SummaryText segments={summary.line3} />}
                first
                last
                onPress={() => openLine(item.key)}
                disabled={rowState.writing}
                accessibilityLabel={summary.a11y}
              />
            </SwipeToDelete>
          )
        }}
        // Cuộn danh sách → đóng nút xoá đang mở (kiểu iOS).
        onScrollBeginDrag={closeOpenSwipeRow}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        contentInsetAdjustmentBehavior="automatic"
        // Chừa đáy theo chiều cao THẬT của vùng nổi (đo bằng onLayout) để dòng cuối cuộn lên khỏi nút.
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: dockHeight + 16,
        }}
        // LUÔN gắn RefreshControl (bỏ/gắn lại làm danh sách gắn lại, nhảy lên đầu). Đang gửi: Android
        // `enabled` false; iOS kéo được nhưng `onRefresh` không làm gì.
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            enabled={!saving}
            onRefresh={() => void onRefresh()}
            tintColor={colors.mutedForeground}
          />
        }
      />
    ) : (
      <ExportStepLoadState wizard={wizard} onRetry={retry} />
    )

  const hasNotice = !!(notices.formNotice || notices.screenNotice)

  return (
    <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
      <WizardHeader
        title={t(isNew ? 'exportForms:compose.newTitle' : 'exportForms:edit.title')}
        subtitle={wizardLabels.subtitle}
        left={nav.atRoot ? 'close' : 'back'}
        onClose={nav.exit}
        scan={{ label: wizardLabels.scan, onPress: openScan, hidden: !ready }}
        menu={{ label: wizardLabels.more, items: menuItems }}
        writing={writing}
      />
      <WarehouseTransition style={{ flex: 1 }}>{body}</WarehouseTransition>
      {/* Thanh đáy CÓ NỀN ngoài danh sách: thông báo mức phiếu + tóm tắt + "Tiếp tục". */}
      {(ready && lines) || hasNotice ? (
        <WizardBottomBar
          testID="export-items-dock"
          onHeight={setDockHeight}
          notice={<ExportStepNotices notices={notices} />}
          summary={
            ready && lines ? (
              <>
                <View
                  testID="export-items-summary"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                    <Text size={13} style={{ color: colors.fillForeground }}>
                      {t('exportForms:wizard.summary', { count: lines.length })}
                    </Text>
                    {gapText ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={gapText}
                        accessibilityHint={gapHint}
                        disabled={writing}
                        hitSlop={{ left: 4, right: 8 }}
                        onPress={toFirstGap}
                        style={({ pressed }) => ({
                          flexShrink: 1,
                          minHeight: 44,
                          justifyContent: 'center',
                          opacity: pressed ? 0.6 : 1,
                        })}
                      >
                        <Text
                          size={13}
                          weight="medium"
                          numberOfLines={1}
                          style={{ color: colors.warningText }}
                        >
                          {` · ${gapText}`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Text testID="export-items-total" numeric weight="bold" size={18}>
                    {formatMoney(total, locale)}
                  </Text>
                </View>
                {step2Ok && !step1Ok ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => goToStep(1)}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      justifyContent: 'center',
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text
                      size={12}
                      weight="medium"
                      style={{ color: colors.warningText, textAlign: 'center' }}
                    >
                      {t('exportForms:wizard.infoMissing')}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null
          }
        >
          {ready && lines ? (
            <WizardMainButton
              blocked={!canNext}
              accessibilityHint={nextHint}
              disabled={writing}
              onPress={onNext}
            >
              {t('exportForms:wizard.next')}
            </WizardMainButton>
          ) : null}
        </WizardBottomBar>
      ) : null}
    </Screen>
  )
}

/** Khoảng cách giữa các thẻ vật tư của bước 2 (nằm trong `SwipeToDelete` để co lại cùng thẻ khi xoá). */
const CARD_GAP = 10
