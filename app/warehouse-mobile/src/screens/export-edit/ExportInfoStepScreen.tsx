import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View, type ScrollViewInstance } from 'react-native'

import { useExportDraft, type ExportHeader } from '@/features/export-draft'
import { WarehouseTransition } from '@/features/warehouse-picker'
import { haptics } from '@/shared/lib/haptics'
import { missingForStep } from '@/shared/lib/missing'
import { wizardVisit } from '@/shared/lib/wizard-screen'
import { stepStatus } from '@/shared/lib/wizard-steps'
import { useTheme } from '@/shared/theme/useTheme'
import { ErrorBanner, FormScrollView, Screen, Text } from '@/shared/ui'
import {
  WizardBottomBar,
  WizardHeader,
  WizardMainButton,
  WizardProgress,
} from '@/shared/ui/compose'

import { ExportHeaderFields, type ExportHeaderFieldsHandle } from './ExportHeaderFields'
import { ExportStepLoadState, ExportStepNotices } from './ExportStepParts'
import { useExportWizardLabels } from './useExportWizardLabels'
import { exportWizardLeave, useExportActions } from './useExportActions'
import { useExportDraftMenu } from './useExportDraftMenu'
import { useExportStepNotices } from './useExportStepNotices'
import { useExportWizardDraft } from './useExportWizardDraft'

/**
 * Khoá bản nháp đang mở cho chứng từ tải lên: (người dùng, kho, phiếu) + phiên bản nháp (`session` — đổi
 * khi bỏ nháp / hết phiên) + lượt mở luồng (`wizardVisit` — đổi khi rời hẳn luồng). Mở lại cùng phiếu
 * sau khi bỏ / rời → khoá khác → kết quả về muộn bị bỏ. Không có bản nháp → `null`.
 */
export function exportAttachmentKey(): string | null {
  const { ctx, draft, session } = useExportDraft.getState()
  if (!ctx || !draft) return null
  const visit = wizardVisit('export', ctx.formSlug)
  return [ctx.userSlug, ctx.warehouseSlug, ctx.formSlug, session, visit].join('|')
}

/**
 * Bước 1 "Thông tin" của phiếu xuất (modal `/export-form/[formSlug]/info`, spec form-wizard §4,
 * wizard-apple §3–4): header [✕ thoát luồng — giữ bản nháp trên máy, không hỏi] "Phiếu xuất mới" / "Sửa phiếu" + "Bước 1/3 ·
 * Thông tin" [⋯ — Lưu nháp / Bỏ / Xoá nháp]; nội dung cuộn: vạch tiến độ (phần tử đầu) + nhóm "Loại phiếu"
 * (viên luôn mở) + nhóm "Thông tin" (`ExportHeaderFields`); thanh đáy có nền: [thông báo mức phiếu] [gợi ý
 * cam "Còn thiếu: …" khi đầu phiếu còn thiếu] ["Tiếp tục" → bước 2, khoá khi đang ghi]. Nạp / gác quyền
 * bản nháp ở `useExportWizardDraft`.
 */
export function ExportInfoStepScreen() {
  const { t } = useTranslation(['exportForms', 'common'])
  const wizardLabels = useExportWizardLabels(1)
  const { colors } = useTheme()
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const wizard = useExportWizardDraft(formSlug)
  const { ready, draft, form, abilities, ctx, isNew, saving, step1Ok, step2Ok, missing, nav } =
    wizard
  const { query } = wizard
  const leave = useMemo(() => exportWizardLeave(nav), [nav])
  const actions = useExportActions({ ctx, form, abilities, leave })

  // Thông báo mức phiếu (store dùng chung, thấy ở mọi bước của phiếu — mọi lỗi ghi đi qua đó).
  const notices = useExportStepNotices(formSlug)

  const { codeError, busy } = actions
  const writing = busy !== null || saving

  // "Lưu nháp" (mục của ⋯; luật bật ở `useExportDraftMenu`). Bấm = `useExportActions.save` (hỏi lại, xong
  // về màn xem qua `nav.finish`).
  const save = useRef(() => {})
  useEffect(() => {
    save.current = () => void actions.save()
  })
  const pressSave = useCallback(() => save.current(), [])
  const menuItems = useExportDraftMenu({
    wizard,
    remove: actions.remove,
    save: pressSave,
    writing,
    onDiscarded: notices.dismiss,
  })

  const status = useMemo(
    () => stepStatus({ current: 1, step1Ok, step2Ok, existing: !isNew }),
    [step1Ok, step2Ok, isNew],
  )
  const progressSteps = useMemo(
    () => status.map((s, i) => ({ ...s, label: wizardLabels.steps[i] ?? '' })),
    [status, wizardLabels.steps],
  )
  const { goToStep, exit } = nav

  const info = useRef<ExportHeaderFieldsHandle>(null)
  const onHeaderChange = useCallback(
    (patch: Partial<ExportHeader>) => useExportDraft.getState().setHeader(patch),
    [],
  )
  const attachmentWarehouse = ctx?.warehouseSlug
  const attachment = useMemo(
    () => ({ warehouseSlug: attachmentWarehouse, getFormKey: exportAttachmentKey }),
    [attachmentWarehouse],
  )
  const gaps = useMemo(() => missingForStep(missing, 1), [missing])
  const stillMissing = gaps
    .map((i) => (i.target.kind === 'header' ? t(`exportForms:fields.${i.target.field}`) : ''))
    .filter(Boolean)
    .join(', ')

  // "Tiếp tục" TRÔNG như khoá khi đầu phiếu còn thiếu nhưng vẫn bấm được: bấm → hiện lỗi các ô + rung
  // lỗi + cuộn lên và focus ô thiếu đầu tiên. Đủ → bước 2.
  const onNext = () => {
    if (step1Ok) {
      goToStep(2)
      return
    }
    info.current?.revealErrors()
    haptics.error()
    const first = gaps[0]?.target
    if (first?.kind === 'header') {
      scrollRef.current?.scrollTo({ y: 0, animated: true })
      info.current?.focus(first.field)
    }
  }

  // Server báo trùng mã: ô Mã phiếu ở đầu trang — cuộn lên cho thấy lỗi.
  const scrollRef = useRef<ScrollViewInstance>(null)
  useEffect(() => {
    if (codeError) scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [codeError])

  const [dockHeight, setDockHeight] = useState(0)

  /** Quãng thanh đáy được nâng lên trên bàn phím (0 khi bàn phím ẩn). */

  const [keyboardLift, setKeyboardLift] = useState(0)
  const { refetch } = query
  const retry = useCallback(() => {
    if (!useExportDraft.getState().saving) void refetch({ cancelRefetch: false })
  }, [refetch])

  const body =
    ready && draft ? (
      <FormScrollView
        ref={scrollRef}
        testID="export-info-scroll"
        contentInsetAdjustmentBehavior="automatic"
        // Thanh đáy tự nâng lên trên bàn phím (`avoidKeyboard`): KHÔNG để iOS tự chừa / tự cuộn theo bàn
        // phím — nó cuộn cả trang lên dù ô không bị che, đẩy vạch tiến độ đè lên header. Ô bị che (bởi
        // bàn phím + thanh đáy) do `useKeyboardReveal` cuộn đúng phần cần.
        automaticallyAdjustKeyboardInsets={false}
        aboveKeyboard={keyboardLift > 0 ? dockHeight : 0}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: dockHeight + keyboardLift + 16,
        }}
      >
        {/* Vạch tiến độ = phần tử ĐẦU của vùng cuộn (không bao giờ nằm dưới header trong suốt). */}
        <WizardProgress
          testID="export-wizard-steps-1"
          steps={progressSteps}
          writing={writing}
          onPress={(i) => goToStep((i + 1) as 1 | 2 | 3)}
        />
        <View style={{ gap: 14 }}>
          {query.isRefetchError ? (
            <ErrorBanner
              message={t('exportForms:view.refreshError')}
              retryLabel={t('common:retry')}
              busy={query.isFetching}
              onRetry={retry}
            />
          ) : null}
          <ExportHeaderFields
            ref={info}
            header={draft.header}
            onChange={onHeaderChange}
            codeError={codeError}
            disabled={saving}
            attachment={attachment}
          />
        </View>
      </FormScrollView>
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
        onClose={exit}
        menu={{ label: wizardLabels.more, items: menuItems }}
        writing={writing}
      />
      <WarehouseTransition style={{ flex: 1 }}>{body}</WarehouseTransition>
      {/* Thanh đáy CÓ NỀN ngoài vùng cuộn: thông báo mức phiếu + còn thiếu + "Tiếp tục". */}
      {ready || hasNotice ? (
        <WizardBottomBar
          testID="export-info-dock"
          onHeight={setDockHeight}
          avoidKeyboard
          onLift={setKeyboardLift}
          notice={<ExportStepNotices notices={notices} />}
          summary={
            ready && !step1Ok && stillMissing ? (
              <Text
                size={13}
                weight="medium"
                style={{ color: colors.warningText, textAlign: 'center' }}
              >
                {t('exportForms:wizard.stillMissing', { fields: stillMissing })}
              </Text>
            ) : null
          }
        >
          {ready ? (
            <WizardMainButton
              blocked={!step1Ok}
              accessibilityHint={
                !step1Ok && stillMissing
                  ? t('exportForms:wizard.stillMissing', { fields: stillMissing })
                  : undefined
              }
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
