import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View, type ScrollViewInstance } from 'react-native'

import { useReceiveDraft, type ReceiveHeader } from '@/features/receive-checklist'
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

import {
  ImportHeaderFields,
  supplierRowFor,
  type ImportHeaderFieldsHandle,
} from './ImportHeaderFields'
import { ImportStepLoadState, ImportStepNotices } from './ImportStepParts'
import { useImportWizardLabels } from './useImportWizardLabels'
import { useImportDraftMenu } from './useImportDraftMenu'
import { useImportStepNotices } from './useImportStepNotices'
import { useImportWizardDraft } from './useImportWizardDraft'
import { importWizardLeave, useReceiveActions } from './useReceiveActions'

/**
 * Khoá bản nháp đang mở cho chứng từ tải lên: (người dùng, kho, phiếu) + phiên bản nháp (`session` — đổi
 * khi bỏ nháp / hết phiên) + lượt mở luồng (`wizardVisit` — đổi khi rời hẳn luồng). Mở lại cùng phiếu
 * sau khi bỏ / rời → khoá khác → kết quả về muộn bị bỏ. Không có bản nháp → `null`.
 */
export function importAttachmentKey(): string | null {
  const { ctx, draft, session } = useReceiveDraft.getState()
  if (!ctx || !draft || draft.formSlug !== ctx.formSlug) return null
  const visit = wizardVisit('import', ctx.formSlug)
  return [ctx.userSlug, ctx.warehouseSlug, ctx.formSlug, session, visit].join('|')
}

/**
 * Bước 1 "Thông tin" của phiếu nhập (modal `/import-form/[formSlug]/info`, spec form-wizard §4,
 * wizard-apple §3–4): header [✕ thoát luồng — giữ bản nháp trên máy, không hỏi] "Phiếu nhập mới" / "Sửa phiếu" + "Bước 1/3 ·
 * Thông tin" [⋯] (KHÔNG "Lưu nháp" — phiếu nhập chỉ lưu ở bước 3); nội dung cuộn: vạch tiến độ + nhóm "Thông tin" (`ImportHeaderFields`: Bên bán,
 * Số HĐ, Ngày nhập, Mã phiếu, Số PO, Ghi chú — phiếu đã có: Bên bán chỉ xem; trùng mã của lần Lưu ở bước
 * 3 báo dưới ô Mã phiếu); thanh đáy có nền: [thông báo mức phiếu] [gợi ý cam "Còn thiếu: …" khi đầu phiếu còn
 * thiếu] ["Tiếp tục" → bước 2]. Nạp / gác quyền bản nháp ở `useImportWizardDraft`.
 */
export function ImportInfoStepScreen() {
  const { t } = useTranslation(['importForms', 'common'])
  const wizardLabels = useImportWizardLabels(1)
  const { colors } = useTheme()
  const router = useRouter()
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const wizard = useImportWizardDraft(formSlug)
  const { ready, draft, form, isNew, saving, step1Ok, step2Ok, missing, nav, query } = wizard
  const { supplierRequired, canPickSupplier, suppliers } = wizard
  // Bước 1 không ghi gì; hook ghi vẫn gắn để đọc `codeError` (trùng mã của lần Lưu ở bước 3 — store
  // dùng chung mọi bước) và `busy`. Mọi thông báo của nó đi qua `useFormNotice` (khối dưới).
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

  // Thông báo mức phiếu (store dùng chung, thấy ở mọi bước của phiếu).
  const notices = useImportStepNotices(formSlug)
  const { codeError, busy } = actions
  const writing = busy !== null || saving
  const menuItems = useImportDraftMenu({
    wizard,
    writing,
    remove: actions.remove,
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

  const info = useRef<ImportHeaderFieldsHandle>(null)
  const scrollRef = useRef<ScrollViewInstance>(null)
  const onHeaderChange = useCallback(
    (patch: Partial<ReceiveHeader>) => useReceiveDraft.getState().setHeader(patch),
    [],
  )
  const attachmentWarehouse = wizard.ctx?.warehouseSlug
  const attachment = useMemo(
    () => ({ warehouseSlug: attachmentWarehouse, getFormKey: importAttachmentKey }),
    [attachmentWarehouse],
  )
  const openSupplier = useCallback(() => {
    router.navigate('/import-supplier')
    // `router` đổi định danh mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const supplierRow = useMemo(
    () =>
      draft
        ? supplierRowFor({
            draft,
            isNew,
            canPickSupplier,
            suppliers,
            supplierRequired,
            onPress: openSupplier,
          })
        : null,
    [draft, isNew, canPickSupplier, suppliers, supplierRequired, openSupplier],
  )

  const gaps = useMemo(() => missingForStep(missing, 1), [missing])
  const stillMissing = gaps
    .map((i) =>
      i.target.kind === 'header' ? t(`importForms:compose.fields.${i.target.field}`) : '',
    )
    .filter(Boolean)
    .join(', ')

  // "Tiếp tục" TRÔNG như khoá khi đầu phiếu còn thiếu nhưng vẫn bấm được: bấm → hiện lỗi các ô + rung
  // lỗi + cuộn lên và focus ô thiếu đầu tiên (Bên bán / Ngày: nháy nền dòng). Đủ → bước 2.
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
  useEffect(() => {
    if (codeError) scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [codeError])

  const [dockHeight, setDockHeight] = useState(0)

  /** Quãng thanh đáy được nâng lên trên bàn phím (0 khi bàn phím ẩn). */

  const [keyboardLift, setKeyboardLift] = useState(0)
  const { refetch } = query
  const retry = useCallback(() => {
    if (!useReceiveDraft.getState().saving) void refetch({ cancelRefetch: false })
  }, [refetch])

  const body =
    ready && draft ? (
      <FormScrollView
        ref={scrollRef}
        testID="import-info-scroll"
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
          testID="import-wizard-steps-1"
          steps={progressSteps}
          writing={writing}
          onPress={(i) => goToStep((i + 1) as 1 | 2 | 3)}
        />
        <View style={{ gap: 14 }}>
          {query.isRefetchError ? (
            <ErrorBanner
              message={t('importForms:view.refreshError')}
              retryLabel={t('common:retry')}
              busy={query.isFetching}
              onRetry={retry}
            />
          ) : null}
          <ImportHeaderFields
            ref={info}
            header={draft.header}
            onChange={onHeaderChange}
            supplier={supplierRow}
            supplierRequired={supplierRequired}
            isNew={isNew}
            codeError={codeError}
            disabled={saving}
            attachment={attachment}
          />
        </View>
      </FormScrollView>
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
        onClose={exit}
        menu={{ label: wizardLabels.more, items: menuItems }}
        writing={writing}
      />
      <WarehouseTransition style={{ flex: 1 }}>{body}</WarehouseTransition>
      {/* Thanh đáy CÓ NỀN ngoài vùng cuộn: thông báo mức phiếu + còn thiếu + "Tiếp tục". */}
      {ready || hasNotice ? (
        <WizardBottomBar
          testID="import-info-dock"
          onHeight={setDockHeight}
          avoidKeyboard
          onLift={setKeyboardLift}
          notice={<ImportStepNotices notices={notices} />}
          summary={
            ready && !step1Ok && stillMissing ? (
              <Text
                size={13}
                weight="medium"
                style={{ color: colors.warningText, textAlign: 'center' }}
              >
                {t('importForms:wizard.stillMissing', { fields: stillMissing })}
              </Text>
            ) : null
          }
        >
          {ready ? (
            <WizardMainButton
              blocked={!step1Ok}
              accessibilityHint={
                !step1Ok && stillMissing
                  ? t('importForms:wizard.stillMissing', { fields: stillMissing })
                  : undefined
              }
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
