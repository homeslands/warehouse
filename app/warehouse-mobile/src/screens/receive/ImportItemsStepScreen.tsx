import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, RefreshControl, View, type FlatListInstance } from 'react-native'

import {
  importLineSummary,
  linesTotal,
  MAX_ITEMS,
  useReceiveDraft,
  type LocalLine,
} from '@/features/receive-checklist'
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

import { ImportStepLoadState, ImportStepNotices } from './ImportStepParts'
import { useImportWizardLabels } from './useImportWizardLabels'
import { importMissingLabel } from './import-missing'
import { useScanNotice } from './scan-notice.store'
import { useImportDraftMenu } from './useImportDraftMenu'
import { useImportStepNotices } from './useImportStepNotices'
import { useImportWizardDraft } from './useImportWizardDraft'
import { importWizardLeave, useReceiveActions } from './useReceiveActions'

/**
 * Bước 2 "Vật tư" của phiếu nhập (modal `/import-form/[formSlug]/edit`, spec form-wizard §5,
 * wizard-apple §6; cùng khuôn `ExportItemsStepScreen`): header trái theo vị trí trong modal — màn đầu
 * modal (vd "Sửa phiếu" mở thẳng bước 2) ✕ đóng modal, màn được đẩy lên ‹ (back gốc — lùi một bước);
 * "Phiếu nhập mới" / "Sửa phiếu" + "Bước 2/3 · Vật tư" [quét] [⋯] (KHÔNG "Lưu nháp" —
 * phiếu nhập chỉ lưu ở bước 3); vạch tiến độ + MỘT khối nhóm "Vật tư · n": mỗi vật tư một dòng CHỈ ĐỌC
 * (`LineSummaryRow` trong `SwipeToDelete`, chạm → sheet sửa dòng `/import-line?compose=1`), dòng cuối "⊕
 * Thêm vật tư" (chỉ khi có `IMPORT_FORM_CREATE`); trống → khối chỉ có "⊕ Thêm vật tư" + câu xám; thanh đáy
 * có nền: [thông báo mức phiếu] [tóm tắt "n vật tư · k chưa đủ" (chạm phần cam → sheet của dòng thiếu đầu
 * tiên; giá trống KHÔNG thiếu) + tổng tiền] [gợi ý "Thông tin phiếu còn thiếu" → bước 1] ["Tiếp tục" →
 * bước 3]. Dòng vừa thêm (bộ chọn) / vừa quét → sheet của dòng đó tự mở (`useComposeLineOpen`).
 *
 * Bản nháp DÙNG CHUNG với checklist Kiểm hàng (`useReceiveDraft`, cùng khoá `kv`): mọi sửa (sheet) là
 * `{ check: false }` nên dấu đã kiểm giữ nguyên; dòng số 0 ("Không nhận" của checklist) ở đây là thiếu số
 * lượng. Nạp / gác quyền bản nháp ở `useImportWizardDraft` (dùng chung mọi bước).
 */
export function ImportItemsStepScreen() {
  const { t, i18n } = useTranslation(['importForms', 'common'])
  const wizardLabels = useImportWizardLabels(2)
  const { colors } = useTheme()
  const router = useRouter()
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const locale = i18n.language === 'en' ? 'en' : 'vi'
  const wizard = useImportWizardDraft(formSlug)
  const { ready, draft, form, isNew, saving, step1Ok, step2Ok, missing, nav, query } = wizard
  const canAddLines = wizard.canAddLine
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Bước 2 không ghi gì; hook ghi vẫn gắn (cùng khuôn bước 1 / 3) — mọi thông báo của nó đi qua
  // `useFormNotice` (khối dưới), lần Lưu ở bước 3 mở lại phiếu đã tạo cũng báo ở đó.
  const leave = useMemo(() => importWizardLeave(nav), [nav])
  const actions = useReceiveActions({
    warehouseSlug: wizard.ctx?.warehouseSlug,
    form,
    isNew,
    canEdit: !!wizard.abilities?.canEdit,
    checklist: false,
    compose: true,
    leave,
  })
  const { busy } = actions
  const writing = busy !== null || saving
  const lines: LocalLine[] | null = ready && draft ? draft.lines : null
  const total = useMemo(() => linesTotal(lines ?? []), [lines])

  // Mã quét không khớp dòng / vật tư nào, phiếu đủ dòng, vật tư chưa có đơn vị (sheet `/scan-line?compose=1`).
  const scan = useScanNotice((s) => (s.notice?.formSlug === formSlug ? s.notice : null))
  const scanNotice = scan
    ? scan.reason === 'notOnForm'
      ? t('importForms:receive.scan.notFound', { code: scan.code })
      : scan.reason === 'full'
        ? t('importForms:compose.scanFull', { code: scan.code, max: MAX_ITEMS })
        : scan.reason === 'noUnit'
          ? t('importForms:compose.scanNoUnit', { code: scan.code })
          : t('importForms:compose.scanNotFound', { code: scan.code })
    : null
  const dismissScan = useCallback(() => useScanNotice.getState().clear(), [])
  // Thông báo mức phiếu (store dùng chung) TRƯỚC, rồi của màn: mã quét không khớp.
  const notices = useImportStepNotices(formSlug, { message: scanNotice, dismiss: dismissScan })
  // Rời màn thì bỏ thông báo quét (không để nó hiện lại ở phiếu khác).
  useEffect(() => () => useScanNotice.getState().clear(), [])

  // Sheet sửa dòng (chế độ soạn): chạm dòng / phần thiếu → mở thường; dòng vừa thêm / vừa quét (yêu cầu
  // `useLineFocus` của bộ chọn / sheet quét) → tự mở MỘT lần khi màn được focus lại, ô số focus sẵn.
  const { openLine } = useComposeLineOpen({
    kind: 'import',
    formSlug,
    href: (key, { justAdded }) => {
      const state = useReceiveDraft.getState()
      if (state.saving || !state.draft?.lines.some((l) => l.key === key)) return null
      return {
        pathname: '/import-line',
        params: justAdded ? { key, compose: '1', focus: 'quantity' } : { key, compose: '1' },
      }
    },
  })
  /** Vuốt xoá: dòng có sẵn trên server → hỏi lại; dòng mới thêm trên máy → xoá ngay (spec §5.2). */
  const swipeDelete = useCallback(
    async (line: LocalLine, out: () => Promise<void>) => {
      if (useReceiveDraft.getState().saving) return
      if (line.base) {
        const ok = await confirmAction({
          title: t('importForms:wizard.removeTitle', { name: line.materialName }),
          confirmLabel: t('common:compose.delete'),
          cancelLabel: t('common:cancel'),
          destructive: true,
        })
        if (!ok) return
      }
      haptics.selection()
      // Thẻ trượt ra + chỗ trống co lại XONG mới gỡ dòng (không nhảy danh sách).
      await out()
      if (useReceiveDraft.getState().saving) return
      useReceiveDraft.getState().removeLine(line.key)
    },
    [t],
  )

  const listRef = useRef<FlatListInstance>(null)
  const openScan = useCallback(() => {
    router.navigate({ pathname: '/scan-line', params: { compose: '1' } })
    // `router` đổi định danh mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openAdd = useCallback(() => {
    router.navigate('/import-pick')
    // `router` đổi định danh mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phần còn thiếu của bước 2: mỗi dòng thiếu (số lượng, HSD trước ngày nhập) tính MỘT lần ("k chưa đủ",
  // theo thứ tự danh sách), cộng mục không thuộc dòng nào ("Chưa có vật tư", "Quá 200 dòng"). Giá trống
  // không thiếu.
  const gaps = useMemo(() => missingForStep(missing, 2), [missing])
  const { incomplete, other } = useMemo(
    () =>
      lineGaps(
        gaps,
        (lines ?? []).map((l) => l.key),
      ),
    [gaps, lines],
  )
  const gapText = useMemo(() => {
    const label = importMissingLabel(t)
    const counts = new Map<string, number>()
    for (const g of other) counts.set(g.group, (counts.get(g.group) ?? 0) + 1)
    return [
      ...(incomplete.length > 0
        ? [t('importForms:wizard.incomplete', { count: incomplete.length })]
        : []),
      ...[...counts].map(([group, n]) => label(group, n)),
    ].join(', ')
  }, [incomplete, other, t])
  /**
   * Tới mục thiếu: dòng → sheet của dòng đó; chưa có dòng → bộ chọn vật tư (không được thêm vật tư → chỉ
   * cuộn lên đầu, nơi có Quét mã trên header).
   */
  const goTo = useCallback(
    (target: MissingTarget) => {
      if (target.kind === 'lines') {
        if (canAddLines) openAdd()
        else listRef.current?.scrollToOffset({ offset: 0, animated: true })
      } else if (target.kind === 'line') openLine(target.key)
    },
    [openAdd, openLine, canAddLines],
  )
  /** Tới chỗ thiếu ĐẦU TIÊN của bước 2: sheet của dòng thiếu đầu tiên, không thì mục khác. `false` = đủ. */
  // Gợi ý a11y của phần cam = việc `toFirstGap` sẽ làm (chưa có dòng → bộ chọn / cuộn lên đầu).
  const gapHint = t(
    !incomplete[0] && other[0]?.target.kind === 'lines'
      ? canAddLines
        ? 'importForms:wizard.goToAdd'
        : 'importForms:wizard.goToTop'
      : 'importForms:wizard.goToMissing',
  )
  const toFirstGap = () => {
    if (incomplete[0]) openLine(incomplete[0])
    else if (other[0]) goTo(other[0].target)
    else return false
    return true
  }

  // `⋯`: Bỏ thay đổi trên máy / Bỏ phiếu mới.
  const menuItems = useImportDraftMenu({
    wizard,
    writing,
    remove: actions.remove,
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
      ? t('importForms:wizard.stillMissing', { fields: gapText })
      : t('importForms:wizard.infoMissing')
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
    if (!useReceiveDraft.getState().saving) void refetch({ cancelRefetch: false })
  }, [refetch])
  const onRefresh = useCallback(async () => {
    // Phiếu mới không có gì trên server để tải lại.
    if (isNew || useReceiveDraft.getState().saving) return
    setPulling(true)
    try {
      await refetch({ cancelRefetch: false })
    } finally {
      if (mounted.current) setPulling(false)
    }
  }, [refetch, isNew])

  // FlatList chỉ vẽ lại dòng khi `data`/`extraData` đổi: khoá khi ghi, ngày phiếu, quyền thêm phải qua đây.
  const formDate = draft?.header.date ?? ''
  const rowState = useMemo(() => ({ writing, formDate }), [writing, formDate])

  const listHeader = (
    <View style={{ gap: 12 }}>
      {/* Vạch tiến độ = phần tử ĐẦU của vùng cuộn (không bao giờ nằm dưới header trong suốt). */}
      <WizardProgress
        testID="import-wizard-steps-2"
        steps={progressSteps}
        writing={writing}
        onPress={(i) => goToStep((i + 1) as 1 | 2 | 3)}
      />
      {query.isRefetchError ? (
        <ErrorBanner
          message={t('importForms:view.refreshError')}
          retryLabel={t('common:retry')}
          busy={query.isFetching}
          onRetry={retry}
        />
      ) : null}
      {/* Tiêu đề khối nhóm (quét mã nằm trên header — spec wizard-apple §3). */}
      <ComposeSectionHeader title={t('importForms:wizard.itemsGroup', { n: lines?.length ?? 0 })} />
    </View>
  )
  const listFooter = (
    <View>
      {/* Dòng cuối khối "⊕ Thêm vật tư" — cần IMPORT_FORM_CREATE (backend gác `available-materials`);
          khối trống → nó là dòng đầu (bo cả trên). Quét mã (header) vẫn tìm dòng đã có khi không thêm được. */}
      {/* Thẻ riêng như mỗi vật tư (cách thẻ trên 10). */}
      {canAddLines ? (
        <View>
          <AddLineRow
            testID="import-items-add"
            label={t('importForms:wizard.add')}
            onPress={openAdd}
            disabled={writing}
            first
          />
        </View>
      ) : null}
      {lines?.length === 0 ? (
        <View
          testID="import-items-empty"
          style={{ paddingTop: canAddLines ? 12 : 4, paddingHorizontal: 18 }}
        >
          <Text muted size={13}>
            {t('importForms:wizard.empty')}
          </Text>
        </View>
      ) : null}
    </View>
  )

  const body =
    ready && lines ? (
      <FlatList
        ref={listRef}
        testID="import-items-list"
        data={lines}
        keyExtractor={(l) => l.key}
        extraData={rowState}
        renderItem={({ item }) => {
          const summary = importLineSummary(item, { formDate: rowState.formDate, t, locale })
          return (
            <SwipeToDelete
              label={t('common:compose.delete')}
              enabled={!rowState.writing}
              onDelete={(out) => swipeDelete(item, out)}
              spacing={CARD_GAP}
            >
              <LineSummaryRow
                testID={`import-line-${item.key}`}
                icon="import"
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
        // LUÔN gắn RefreshControl (bỏ/gắn lại làm danh sách gắn lại, nhảy lên đầu). Phiếu mới / đang gửi:
        // Android `enabled` false; iOS kéo được nhưng `onRefresh` không làm gì.
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            enabled={!saving && !isNew}
            onRefresh={() => void onRefresh()}
            tintColor={colors.mutedForeground}
          />
        }
      />
    ) : (
      <ImportStepLoadState wizard={wizard} onRetry={retry} />
    )

  const hasNotice = !!(notices.formNotice || notices.screenNotice)

  return (
    <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
      <WizardHeader
        title={t(isNew ? 'importForms:compose.newTitle' : 'importForms:compose.editTitle')}
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
          testID="import-items-dock"
          onHeight={setDockHeight}
          notice={<ImportStepNotices notices={notices} />}
          summary={
            ready && lines ? (
              <>
                <View
                  testID="import-items-summary"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                    <Text size={13} style={{ color: colors.fillForeground }}>
                      {t('importForms:wizard.summary', { count: lines.length })}
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
                  <Text testID="import-items-total" numeric weight="bold" size={18}>
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
                      {t('importForms:wizard.infoMissing')}
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
              {t('importForms:wizard.next')}
            </WizardMainButton>
          ) : null}
        </WizardBottomBar>
      ) : null}
    </Screen>
  )
}

/** Khoảng cách giữa các thẻ vật tư của bước 2 (nằm trong `SwipeToDelete` để co lại cùng thẻ khi xoá). */
const CARD_GAP = 10
