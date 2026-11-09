import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, View } from 'react-native'

import { useReceiveDraft } from '@/features/receive-checklist'
import { WarehouseTransition } from '@/features/warehouse-picker'
import type { FormatLocale } from '@/shared/lib/format'
import { canEnterStep3, stepStatus, type WizardStep } from '@/shared/lib/wizard-steps'
import { AttachmentRow, Button, ErrorBanner, Screen, Text } from '@/shared/ui'
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

import { supplierRowFor } from './ImportHeaderFields'
import { ImportStepLoadState, ImportStepNotices } from './ImportStepParts'
import { useImportWizardLabels } from './useImportWizardLabels'
import { importReview } from './import-review'
import { useImportDraftMenu } from './useImportDraftMenu'
import { useImportStepNotices } from './useImportStepNotices'
import { useImportWizardDraft } from './useImportWizardDraft'
import { importWizardLeave, useReceiveActions } from './useReceiveActions'

/** Dòng Bên bán ở bước 3 chỉ cần tên (không chạm được). */
const noop = () => {}

/**
 * Bước 3 "Xác nhận" của phiếu nhập (modal `/import-form/[formSlug]/review`, spec form-wizard §6; cùng khuôn
 * `ExportReviewStepScreen`; wizard-apple §3–4, §8): header ‹ (back gốc — lùi một bước) + "Bước 3/3 · Xác
 * nhận" [⋯] (KHÔNG "Lưu nháp"); vạch tiến độ đầu vùng cuộn; khối nhóm CHỈ ĐỌC kiểu Cài đặt: "Thông tin"
 * ("Sửa" chữ accent ở tiêu đề nhóm → bước 1), "Vật tư · n" ("Sửa" → bước 2; mỗi dòng = dòng đọc của bước 2
 * — `LineSummaryRow` không chevron, không bấm được), chân nhóm: "Lưu ý" chữ cam (chỉ khi có) + câu ghi chú
 * mờ; thanh đáy có nền: [thông báo mức phiếu] ["Tổng cộng" + tổng] ["Lưu phiếu nhập" / "Lưu phiếu" — KHÔNG
 * hỏi lại: chính bước này là bước xác nhận; phiếu đã có chưa đổi gì → khoá + "Chưa có thay đổi"]. Vào khi
 * bước 1 / 2 chưa đủ → về bước thiếu.
 */
export function ImportReviewStepScreen() {
  const { t, i18n } = useTranslation(['importForms', 'common'])
  const wizardLabels = useImportWizardLabels(3)
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const wizard = useImportWizardDraft(formSlug)
  const { ready, draft, form, isNew, saving, step1Ok, step2Ok, dirty, nav, query } = wizard
  const { supplierRequired, canPickSupplier, suppliers } = wizard

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
  const notices = useImportStepNotices(formSlug)

  // Chỉ vào được khi bước 1 VÀ bước 2 đủ (spec §3.2): mở thẳng link / bản nháp đổi → về bước thiếu.
  const canEnter = canEnterStep3(step1Ok, step2Ok)
  const { goToStep } = nav
  const redirected = useRef(false)
  useEffect(() => {
    if (!ready || canEnter || redirected.current) return
    redirected.current = true
    goToStep(step1Ok ? 2 : 1)
  }, [ready, canEnter, step1Ok, goToStep])

  const review = useMemo(() => {
    if (!ready || !draft) return null
    const supplier = supplierRowFor({
      draft,
      isNew,
      canPickSupplier,
      suppliers,
      supplierRequired,
      onPress: noop,
    })
    return importReview(draft, { supplierName: supplier?.name ?? null, t, locale })
  }, [ready, draft, isNew, canPickSupplier, suppliers, supplierRequired, t, locale])

  const status = useMemo(
    () => stepStatus({ current: 3, step1Ok, step2Ok, existing: !isNew }),
    [step1Ok, step2Ok, isNew],
  )
  const progressSteps = useMemo(
    () => status.map((s, i) => ({ ...s, label: wizardLabels.steps[i] ?? '' })),
    [status, wizardLabels.steps],
  )
  const locked = busy !== null || saving
  const menuItems = useImportDraftMenu({
    wizard,
    writing: locked,
    remove: actions.remove,
    onDiscarded: notices.dismiss,
  })
  // Ghi xong mà đang rời luồng (`busy` giữ tới khi màn tháo ra): bản nháp có thể đã bị bỏ / chuyển
  // slug → giữ tóm tắt lần cuối, không đổi sang vòng quay tải trong lúc Stack pop.
  const [lastReview, setLastReview] = useState(review)
  if (review && canEnter && review !== lastReview) setLastReview(review)
  const shown = review && canEnter ? review : busy !== null ? lastReview : null
  // Phiếu đã có chưa đổi gì: PATCH rỗng chỉ làm tăng version (spec §3.3) → khoá + câu mờ.
  const unchanged = !isNew && !dirty
  const onSave = () => void actions.save()
  /** "Lưu & xác nhận" (IMPORT_FORM_CONFIRM, như web): hỏi lại — cộng tồn ngay, không sửa được nữa. */
  const onConfirm = () => void actions.confirm()
  const canConfirm = !!wizard.abilities?.canConfirm
  const draftLabel = t(
    isNew ? 'importForms:wizard.review.save' : 'importForms:wizard.review.saveExisting',
  )

  const [dockHeight, setDockHeight] = useState(0)
  const { refetch } = query
  const retry = useCallback(() => {
    if (!useReceiveDraft.getState().saving) void refetch({ cancelRefetch: false })
  }, [refetch])

  const sectionEdit = (section: string, step: WizardStep) => ({
    label: t('importForms:wizard.review.edit'),
    accessibilityLabel: t('importForms:wizard.review.editA11y', { section }),
    disabled: locked,
    onPress: () => goToStep(step),
  })

  const listHeader = shown ? (
    <View>
      {/* Vạch tiến độ = phần tử ĐẦU của vùng cuộn (không bao giờ nằm dưới header trong suốt). */}
      <WizardProgress
        testID="import-wizard-steps-3"
        steps={progressSteps}
        writing={locked}
        onPress={(i) => goToStep((i + 1) as WizardStep)}
      />
      {query.isRefetchError ? (
        <View style={{ marginBottom: 8 }}>
          <ErrorBanner
            message={t('importForms:view.refreshError')}
            retryLabel={t('common:retry')}
            busy={query.isFetching}
            onRetry={retry}
          />
        </View>
      ) : null}
      <ComposeSectionHeader
        testID="import-review-info-header"
        title={t('importForms:wizard.review.info')}
        action={sectionEdit(t('importForms:wizard.review.info'), 1)}
      />
      <ReviewInfoGroup testID="import-review-info" rows={shown.infoRows} />
      {draft?.header.file ? (
        <View style={{ marginTop: 8 }}>
          <AttachmentRow
            testID="import-review-attachment"
            value={draft.header.file}
            label={t('importForms:fieldFile')}
          />
        </View>
      ) : null}
      <View style={{ height: 6 }} />
      <ComposeSectionHeader
        testID="import-review-items-header"
        title={t('importForms:wizard.review.items', { n: shown.lines.length })}
        action={sectionEdit(t('importForms:wizard.steps.items'), 2)}
      />
    </View>
  ) : undefined

  const listFooter = shown ? (
    <ReviewNotes
      title={t('importForms:wizard.review.warnings')}
      warnings={shown.warnings}
      // Có quyền xác nhận: nói rõ khác nhau giữa hai nút (như web).
      footnote={canConfirm ? t('importForms:wizard.review.footnoteConfirm') : shown.footnote}
      warningsTestID="import-review-warnings"
      footnoteTestID="import-review-footnote"
    />
  ) : undefined

  const body = shown ? (
    <FlatList
      testID="import-review-list"
      data={shown.lines}
      keyExtractor={(l) => l.key}
      renderItem={({ item, index }) => (
        <LineSummaryRow
          testID={`import-review-line-${item.key}`}
          icon="import"
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
        menu={{ label: wizardLabels.more, items: menuItems }}
        // Bước 3: nút ghi ở đáy KHÔNG hỏi lại → ⋯ là action sheet (modal), không UIMenu (chạm đóng lọt xuống).
        menuStyle="sheet"
        writing={locked}
      />
      <WarehouseTransition style={{ flex: 1 }}>{body}</WarehouseTransition>
      {/* Thanh đáy CÓ NỀN ngoài danh sách: thông báo mức phiếu + tổng + "Lưu nháp" [+ "Lưu & xác nhận"]. */}
      {shown || hasNotice ? (
        <WizardBottomBar
          testID="import-review-dock"
          onHeight={setDockHeight}
          notice={<ImportStepNotices notices={notices} />}
          summary={
            shown ? (
              <>
                <ReviewTotal
                  testID="import-review-total"
                  label={t('importForms:wizard.review.total')}
                  total={shown.total}
                  locale={locale}
                />
                {unchanged && !locked ? (
                  <Text
                    testID="import-review-unchanged"
                    muted
                    size={12}
                    style={{ textAlign: 'center' }}
                  >
                    {t('importForms:wizard.review.unchanged')}
                  </Text>
                ) : null}
              </>
            ) : null
          }
        >
          {shown ? (
            canConfirm ? (
              // Có quyền xác nhận: [Lưu nháp (viền)] [Lưu & xác nhận (chính)] — như bước ③ của web.
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button
                  testID="import-review-save-draft"
                  variant="outline"
                  capsule
                  style={{ flex: 1, minHeight: 52, borderRadius: 26 }}
                  loading={busy === 'save'}
                  disabled={locked || unchanged}
                  accessibilityHint={
                    unchanged ? t('importForms:wizard.review.unchanged') : undefined
                  }
                  onPress={onSave}
                >
                  {draftLabel}
                </Button>
                <View style={{ flex: 1 }}>
                  <WizardMainButton
                    testID="import-review-save-confirm"
                    loading={busy === 'confirm'}
                    disabled={locked}
                    onPress={onConfirm}
                  >
                    {t('importForms:wizard.review.saveAndConfirm')}
                  </WizardMainButton>
                </View>
              </View>
            ) : (
              <WizardMainButton
                loading={busy === 'save'}
                disabled={locked || unchanged}
                accessibilityHint={unchanged ? t('importForms:wizard.review.unchanged') : undefined}
                onPress={onSave}
              >
                {draftLabel}
              </WizardMainButton>
            )
          ) : null}
        </WizardBottomBar>
      ) : null}
    </Screen>
  )
}
