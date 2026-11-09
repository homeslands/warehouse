import { useRouter } from 'expo-router'
import { CloudOff } from '@/shared/ui/icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'

import type { UserWarehouse } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  WarehouseList,
  useApplyWarehouse,
  useSelectWarehouseErrorAlert,
} from '@/features/warehouse-picker'
import { LogoutButton } from '@/features/logout'
import { errorMessage } from '@/shared/api/error-message'
import { haptics } from '@/shared/lib/haptics'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useSheetSubmit } from '@/shared/lib/useSheetSubmit'
import { Button, EmptyState, LargeTitle, Screen, SheetScaffold } from '@/shared/ui'

export type SelectWarehouseScreenProps = {
  /**
   * `screen`: lần đầu sau đăng nhập (user nhiều kho chưa chọn) — màn gốc, tiêu đề lớn, chạm là chọn.
   * `sheet`: đổi kho từ viên kho / màn Tài khoản (route `/switch-warehouse`) — chạm chỉ đánh dấu,
   * ✓ mới ghi rồi đóng, ✕ đóng không đổi gì.
   */
  mode: 'screen' | 'sheet'
}

export function SelectWarehouseScreen({ mode }: SelectWarehouseScreenProps) {
  return mode === 'sheet' ? <SwitchSheet /> : <FirstTimePicker />
}

/** Chọn xong thay bằng `/` — route `/` luôn bị khoá, SessionGate chuyển tới đích hiện tại. */
function FirstTimePicker() {
  const { t } = useTranslation(['auth'])
  const router = useRouter()
  const current = useWarehouseStore((s) => s.current)
  const failed = useWarehouseStore((s) => s.resolution === 'error')
  const { apply } = useApplyWarehouse(() => router.replace('/'))
  return (
    // Card push không có header: giữ đủ 4 cạnh vùng an toàn. `testID` để test ghim điều này.
    <Screen tone="grouped" testID="select-warehouse-screen">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <View style={{ paddingTop: 8 }}>
          <LargeTitle>{t('auth:selectWarehouse')}</LargeTitle>
        </View>
        {failed ? (
          <LoadFailed />
        ) : (
          <WarehouseList selectedSlug={current?.slug} onPressWarehouse={(w) => void apply(w)} />
        )}
      </ScrollView>
    </Screen>
  )
}

/**
 * Tải danh sách kho lỗi (ADMIN+, `GET /warehouses`): câu lỗi + Thử lại (resolve lại — có kho thì
 * SessionGate tự chuyển) + Đăng xuất. Không đưa sang `/no-access` ("chưa được gán kho" là sai).
 */
function LoadFailed() {
  const { t } = useTranslation(['auth', 'common', 'errors'])
  const error = useWarehouseStore((s) => s.error)
  const [retrying, setRetrying] = useState(false)
  const retry = async () => {
    setRetrying(true)
    try {
      await useWarehouseStore.getState().retry()
    } finally {
      setRetrying(false)
    }
  }
  return (
    <View style={{ paddingTop: 48, gap: 16 }}>
      <EmptyState
        icon={CloudOff}
        title={t('auth:warehouseLoadFailed')}
        description={errorMessage(error, t)}
      />
      <View style={{ gap: 8 }}>
        <Button loading={retrying} onPress={() => void retry()}>
          {t('common:retry')}
        </Button>
        <LogoutButton variant="ghost" />
      </View>
    </View>
  )
}

function SwitchSheet() {
  const { t } = useTranslation(['auth', 'common'])
  const current = useWarehouseStore((s) => s.current)
  const [marked, setMarked] = useState<UserWarehouse | null>(current)
  const close = useCloseSheet()
  const alertError = useSelectWarehouseErrorAlert()
  const { doneState, submit } = useSheetSubmit({
    onSubmit: () => useWarehouseStore.getState().select(marked!),
    onClose: close,
    onError: alertError,
  })

  const done = () => {
    if (!marked || marked.slug === current?.slug) close()
    else void submit()
  }

  const mark = (w: UserWarehouse) => {
    if (doneState !== 'idle' || w.slug === marked?.slug) return
    haptics.selection()
    setMarked(w)
  }

  return (
    <SheetScaffold
      testID="select-warehouse-screen"
      title={t('auth:selectWarehouse')}
      cancelLabel={t('common:cancel')}
      doneLabel={t('common:done')}
      onCancel={close}
      onDone={done}
      doneState={doneState}
    >
      <WarehouseList selectedSlug={marked?.slug} variant="cards" onPressWarehouse={mark} />
    </SheetScaffold>
  )
}
