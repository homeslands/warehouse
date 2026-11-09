import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, View } from 'react-native'

import { formatLotLabel } from '@/entities/export-form'
import { useInventory } from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import { availableInLineUnit, useExportDraft, useLotInfo } from '@/features/export-draft'
import { WarehouseTransition } from '@/features/warehouse-picker'
import type { FormatLocale } from '@/shared/lib/format'
import { canEnterStep3, stepStatus, type WizardStep } from '@/shared/lib/wizard-steps'
import { AttachmentRow, ErrorBanner, Screen } from '@/shared/ui'
import {
  ComposeSectionHeader,
  LineSummaryRow,
  ReviewInfoGroup,
  ReviewNotes,
  ReviewTotal,
  SummaryText,
  WizardBottomBar,
  WizardHeader,
  WizardMainButton,
  WizardProgress,
} from '@/shared/ui/compose'

import { ExportStepLoadState, ExportStepNotices } from './ExportStepParts'
import { useExportWizardLabels } from './useExportWizardLabels'
import { exportReview } from './export-review'
import { exportWizardLeave, useExportActions } from './useExportActions'
import { useExportDraftMenu } from './useExportDraftMenu'
import { useExportStepNotices } from './useExportStepNotices'
import { useExportWizardDraft } from './useExportWizardDraft'

/**
 * Bước 3 "Xác nhận" của phiếu xuất (modal `/export-form/[formSlug]/review`, spec form-wizard §6,
 * wizard-apple §3–4, §8): header ‹ (back gốc — lùi một bước) + "Bước 3/3 · Xác nhận" [⋯ — Lưu nháp / Bỏ / Xoá nháp]; vạch
 * tiến độ đầu vùng cuộn; khối nhóm CHỈ ĐỌC kiểu Cài đặt: "Thông tin" ("Sửa" chữ accent ở tiêu đề nhóm →
 * bước 1), "Vật tư · n" ("Sửa" → bước 2; mỗi dòng = dòng đọc của bước 2 — `LineSummaryRow` không chevron,
 * không bấm được), chân nhóm: "Lưu ý" chữ cam (chỉ khi có) + câu ghi chú mờ; thanh đáy có nền: [thông báo
 * mức phiếu] ["Tổng cộng" + tổng] ["Gửi duyệt" — KHÔNG hỏi lại: chính bước này là bước xác nhận]. Vào khi
 * bước 1 / 2 chưa đủ (mở thẳng link, bản nháp đổi) → về bước thiếu.
 */
export function ExportReviewStepScreen() {
  const { t, i18n } = useTranslation(['exportForms', 'common'])
  const wizardLabels = useExportWizardLabels(3)
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const wizard = useExportWizardDraft(formSlug)
  const { ready, draft, form, abilities, ctx, isNew, saving, step1Ok, step2Ok, nav } = wizard
  const { query } = wizard
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)

  const leave = useMemo(() => exportWizardLeave(nav), [nav])
  const actions = useExportActions({ ctx, form, abilities, leave })
  const { busy } = actions
  const notices = useExportStepNotices(formSlug)

  // Chỉ vào được khi bước 1 VÀ bước 2 đủ (spec §3.2): mở thẳng link / bản nháp đổi → về bước thiếu.
  const canEnter = canEnterStep3(step1Ok, step2Ok)
  const { goToStep } = nav
  const redirected = useRef(false)
  useEffect(() => {
    if (!ready || canEnter || redirected.current) return
    redirected.current = true
    goToStep(step1Ok ? 2 : 1)
  }, [ready, canEnter, step1Ok, goToStep])

  // Dòng như bước 2: "còn n" từ tồn của kho (dòng lô tự động) + thông tin lô (dòng chọn lô, ngày nhập),
  // thiếu hàng của lần gửi duyệt lỗi (thông báo mức phiếu).
  const lines = ready && draft ? draft.lines : null
  const inventory = useInventory(warehouseSlug)
  const stockBySlug = useMemo(
    () => new Map((inventory.data ?? []).map((i) => [i.materialSlug, i])),
    [inventory.data],
  )
  const lots = useLotInfo(warehouseSlug, lines ?? undefined)
  const { shortages } = notices
  const review = useMemo(() => {
    if (!ready || !draft) return null
    const now = new Date()
    return exportReview(draft, {
      available: (l) =>
        availableInLineUnit(
          l,
          stockBySlug.get(l.materialSlug),
          l.batchSlug === null ? undefined : lots.get(l.batchSlug),
          draft.lines,
        ),
      lotLabel: (l) =>
        l.batchSlug === null
          ? null
          : formatLotLabel(
              { expiryDate: l.batchExpiryDate, entryDate: lots.get(l.batchSlug)?.entryDate },
              now,
              locale,
            ),
      shortage: (l) => shortages.get(l.key),
      baseUnitName: (l) => stockBySlug.get(l.materialSlug)?.baseUnit?.name ?? null,
      t,
      locale,
    })
  }, [ready, draft, stockBySlug, lots, shortages, t, locale])

  const locked = busy !== null || saving
  // "Lưu nháp" (mục của ⋯; cùng luật với bước 1 / 2 ở `useExportDraftMenu`).
  const save = useRef(() => {})
  useEffect(() => {
    save.current = () => void actions.save()
  })
  const pressSave = useCallback(() => save.current(), [])
  const menuItems = useExportDraftMenu({
    wizard,
    remove: actions.remove,
    save: pressSave,
    writing: locked,
    onDiscarded: notices.dismiss,
  })

  const status = useMemo(
    () => stepStatus({ current: 3, step1Ok, step2Ok, existing: !isNew }),
    [step1Ok, step2Ok, isNew],
  )
  const progressSteps = useMemo(
    () => status.map((s, i) => ({ ...s, label: wizardLabels.steps[i] ?? '' })),
    [status, wizardLabels.steps],
  )
  // Ghi xong mà đang rời luồng (`busy` giữ tới khi màn tháo ra): bản nháp có thể đã bị bỏ / chuyển
  // slug → giữ tóm tắt lần cuối, không đổi sang vòng quay tải trong lúc Stack pop.
  const [lastReview, setLastReview] = useState(review)
  if (review && canEnter && review !== lastReview) setLastReview(review)
  const shown = review && canEnter ? review : busy !== null ? lastReview : null
  const onSubmit = () => void actions.submit()

  const [dockHeight, setDockHeight] = useState(0)
  const { refetch } = query
  const retry = useCallback(() => {
    if (!useExportDraft.getState().saving) void refetch({ cancelRefetch: false })
  }, [refetch])

  const sectionEdit = (section: string, step: WizardStep) => ({
    label: t('exportForms:wizard.review.edit'),
    accessibilityLabel: t('exportForms:wizard.review.editA11y', { section }),
    disabled: locked,
    onPress: () => goToStep(step),
  })

  const listHeader = shown ? (
    <View>
      {/* Vạch tiến độ = phần tử ĐẦU của vùng cuộn (không bao giờ nằm dưới header trong suốt). */}
      <WizardProgress
        testID="export-wizard-steps-3"
        steps={progressSteps}
        writing={locked}
        onPress={(i) => goToStep((i + 1) as WizardStep)}
      />
      {query.isRefetchError ? (
        <View style={{ marginBottom: 8 }}>
          <ErrorBanner
            message={t('exportForms:view.refreshError')}
            retryLabel={t('common:retry')}
            busy={query.isFetching}
            onRetry={retry}
          />
        </View>
      ) : null}
      <ComposeSectionHeader
        testID="export-review-info-header"
        title={t('exportForms:wizard.review.info')}
        action={sectionEdit(t('exportForms:wizard.review.info'), 1)}
      />
      <ReviewInfoGroup testID="export-review-info" rows={shown.infoRows} />
      {draft?.header.file ? (
        <View style={{ marginTop: 8 }}>
          <AttachmentRow
            testID="export-review-attachment"
            value={draft.header.file}
            label={t('exportForms:fields.file')}
          />
        </View>
      ) : null}
      <View style={{ height: 6 }} />
      <ComposeSectionHeader
        testID="export-review-items-header"
        title={t('exportForms:wizard.review.items', { n: shown.lines.length })}
        action={sectionEdit(t('exportForms:wizard.steps.items'), 2)}
      />
    </View>
  ) : undefined

  const listFooter = shown ? (
    <ReviewNotes
      title={t('exportForms:wizard.review.warnings')}
      warnings={shown.warnings}
      footnote={shown.footnote}
      warningsTestID="export-review-warnings"
      footnoteTestID="export-review-footnote"
    />
  ) : undefined

  const body = shown ? (
    <FlatList
      testID="export-review-list"
      data={shown.lines}
      keyExtractor={(l) => l.key}
      renderItem={({ item, index }) => (
        <LineSummaryRow
          testID={`export-review-line-${item.key}`}
          icon="export"
          warning={item.summary.missing}
          title={item.name}
          amount={
            <SummaryText
              segments={[{ text: item.summary.amount, tone: item.summary.amountTone }]}
            />
          }
          line2={
            <SummaryText segments={[{ text: item.summary.line2, tone: item.summary.line2Tone }]} />
          }
          line3={<SummaryText segments={item.summary.line3} />}
          first={index === 0}
          last={index === shown.lines.length - 1}
          accessibilityLabel={item.summary.a11y}
        />
      )}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      contentInsetAdjustmentBehavior="automatic"
      // Chừa đáy theo chiều cao THẬT của vùng nổi (đo bằng onLayout).
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: dockHeight + 16 }}
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
        menu={{ label: wizardLabels.more, items: menuItems }}
        // Bước 3: nút ghi ở đáy KHÔNG hỏi lại → ⋯ là action sheet (modal), không UIMenu (chạm đóng lọt xuống).
        menuStyle="sheet"
        writing={locked}
      />
      <WarehouseTransition style={{ flex: 1 }}>{body}</WarehouseTransition>
      {/* Thanh đáy CÓ NỀN ngoài danh sách: thông báo mức phiếu + tổng + "Gửi duyệt". */}
      {shown || hasNotice ? (
        <WizardBottomBar
          testID="export-review-dock"
          onHeight={setDockHeight}
          notice={<ExportStepNotices notices={notices} />}
          summary={
            shown ? (
              <ReviewTotal
                testID="export-review-total"
                label={t('exportForms:wizard.review.total')}
                total={shown.total}
                locale={locale}
              />
            ) : null
          }
        >
          {shown ? (
            <WizardMainButton loading={busy === 'submit'} disabled={locked} onPress={onSubmit}>
              {t('exportForms:wizard.submit')}
            </WizardMainButton>
          ) : null}
        </WizardBottomBar>
      ) : null}
    </Screen>
  )
}
