import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { materialAbilities, useMaterial, type Material } from '@/entities/material'
import { getSessionEpoch, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { invalidateAfterMaterialWrite } from '@/features/material-form'
import {
  assignToWarehouses,
  canAssignWarehouse,
  warehousePickStates,
} from '@/features/warehouse-assign'
import { filterWarehouses } from '@/features/warehouse-picker'
import { errorMessage } from '@/shared/api/error-message'
import { isApiError } from '@/shared/api/http'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useDiscardGuard } from '@/shared/lib/useDiscardGuard'
import { useSheetSubmit } from '@/shared/lib/useSheetSubmit'
import {
  Button,
  FirstLoadState,
  MaterialPickList,
  PickSelectAllBar,
  SearchField,
  SheetScaffold,
  Text,
  type PickItem,
  ErrorBox,
} from '@/shared/ui'
import { haptics } from '@/shared/lib/haptics'

/** Phiên đổi giữa lúc ghi: bỏ kết quả, không làm mới cache, không đóng. */
const STALE_SESSION = new Error('session-changed')
/** Có kho gắn lỗi: đã báo trong hộp lỗi, giữ sheet mở (không báo lần nữa, không đóng). */
const PARTIAL_FAILURE = new Error('partial-failure')

/**
 * Route `/warehouse-assign?material=<slug>`: sheet GẮN vật tư vào NHIỀU kho (PUT /warehouses/:w/materials, lần lượt từng
 * kho, body chỉ `{ materialSlug }` — ngưỡng theo mặc định vật tư). Giao diện như `/import-pick`. Cần
 * MATERIAL_UPDATE và WAREHOUSE_UPDATE — thiếu thì tự đóng, không request.
 */
export function WarehouseAssignSheetScreen() {
  const { t } = useTranslation(['catalog', 'common', 'errors'])
  const close = useCloseSheet()
  const { material: slug } = useLocalSearchParams<{ material?: string }>()
  const user = useAuthStore((s) => s.user)
  const denied = !canAssignWarehouse(user) || !materialAbilities(user).read
  const missingParam = !slug
  const query = useMaterial(denied || missingParam ? undefined : slug)
  const material = query.data ?? null
  const queryClient = useQueryClient()

  useEffect(() => {
    if (denied || missingParam) close()
  }, [denied, missingParam, close])
  const loadMissing = !material && isApiError(query.error) && query.error.statusCode === 404
  useEffect(() => {
    if (loadMissing) void invalidateAfterMaterialWrite(queryClient)
  }, [loadMissing, queryClient])
  if (denied || missingParam) return null

  if (!material) {
    return (
      <SheetScaffold
        title={t('catalog:warehouseAssign.title')}
        cancelLabel={t('common:close')}
        onCancel={close}
      >
        {loadMissing ? (
          <View style={{ paddingTop: 8 }}>
            <ErrorBox lines={[t('catalog:notFound')]} />
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
  return <AssignBody key={slug} material={material} onClose={close} />
}

function AssignBody({ material, onClose }: { material: Material; onClose: () => void }) {
  const { t } = useTranslation(['catalog', 'common', 'errors'])
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const fetched = useWarehouseStore((s) => s.warehouses)
  const all = fetched ?? user?.warehouses ?? []
  const states = warehousePickStates(all, material)

  const [text, setText] = useState('')
  // Kho đã tick, theo thứ tự tick.
  const [picked, setPicked] = useState<readonly string[]>([])
  const [failLines, setFailLines] = useState<string[] | null>(null)
  const confirming = useRef(false)

  const pickable = new Set(
    states.filter((s) => s.state === 'pickable').map((s) => s.warehouse.slug),
  )
  // Tick còn hiệu lực: kho vừa thành "đã có" / bị tắt thì không tính.
  const valid = picked.filter((slug) => pickable.has(slug))
  const checked: ReadonlySet<string> = new Set(valid)

  const handleError = (e: unknown) => {
    if (e === STALE_SESSION || e === PARTIAL_FAILURE) return
    setFailLines([errorMessage(e, t)])
  }

  const { doneState, submit } = useSheetSubmit({
    onSubmit: async () => {
      const epoch = getSessionEpoch()
      const result = await assignToWarehouses(
        material.slug,
        valid,
        () => getSessionEpoch() !== epoch,
      )
      if (result.stale) throw STALE_SESSION
      // Bỏ tick kho đã gắn được TRƯỚC khi làm mới: làm mới lỗi thì thử lại cũng không gắn trùng.
      if (result.failed.length > 0)
        setPicked((prev) => prev.filter((slug) => !result.ok.includes(slug)))
      if (result.ok.length > 0) await invalidateAfterMaterialWrite(queryClient, material.slug)
      if (result.failed.length === 0) return
      const name = (slug: string) => all.find((w) => w.slug === slug)?.name ?? slug
      const lines = [
        t('catalog:warehouseAssign.partialFailed', { count: result.failed.length }),
        ...result.failed.map((f) => {
          const reason =
            f.reason === 'reassign'
              ? t('catalog:warehouseAssign.reasonReassign')
              : f.reason === 'notFound'
                ? t('catalog:warehouseAssign.reasonNotFound')
                : errorMessage(f.error, t)
          return `${name(f.slug)}: ${reason}`
        }),
      ]
      if (result.failed.some((f) => f.reason === 'reassign'))
        lines.push(t('catalog:warehouseAssign.reassignHint'))
      setFailLines(lines)
      throw PARTIAL_FAILURE
    },
    onClose,
    onError: handleError,
  })
  const busy = doneState !== 'idle'
  const { confirmLeave } = useDiscardGuard({ dirty: valid.length > 0, enabled: !busy })

  const send = async () => {
    if (busy || valid.length === 0 || confirming.current) return
    confirming.current = true
    setFailLines(null)
    let confirmed = false
    try {
      const only = valid.length === 1 ? all.find((w) => w.slug === valid[0]) : undefined
      confirmed = await confirmAction({
        title: only
          ? t('catalog:warehouseAssign.confirm', { code: material.code, warehouse: only.name })
          : t('catalog:warehouseAssign.confirmMany', { code: material.code, count: valid.length }),
        confirmLabel: t('catalog:warehouseAssign.action'),
        cancelLabel: t('common:cancel'),
      })
    } finally {
      confirming.current = false
    }
    if (confirmed) await submit()
  }

  const leave = async () => {
    if (await confirmLeave()) onClose()
  }

  const toggle = (slug: string) => {
    if (busy || !pickable.has(slug)) return
    setFailLines(null)
    setPicked((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]))
    haptics.selection()
  }

  const selectMany = (ids: string[], select: boolean) => {
    setFailLines(null)
    setPicked((prev) => {
      if (!select) return prev.filter((slug) => !ids.includes(slug))
      return [...prev, ...ids.filter((id) => pickable.has(id) && !prev.includes(id))]
    })
  }

  const visible = new Set(
    filterWarehouses(
      states.map((s) => s.warehouse),
      text,
    ).map((w) => w.slug),
  )
  const items: PickItem[] = states
    .filter((s) => visible.has(s.warehouse.slug))
    .map(({ warehouse, state }) => ({
      id: warehouse.slug,
      name: warehouse.name,
      code: warehouse.code,
      detail: null,
      // Đang gửi: khoá mọi dòng gắn được (không nhãn).
      state: busy && state === 'pickable' ? 'locked' : state,
      lockedLabel: state === 'locked' ? t('catalog:warehouseAssign.inactive') : undefined,
      lockedTone: state === 'locked' ? 'destructive' : undefined,
    }))

  // Không giới hạn số kho: luôn ≥ 1 để danh sách không bao giờ "đầy" (tránh hộp cảnh báo rỗng).
  const capacityLeft = Math.max(1, pickable.size - valid.length)

  return (
    <SheetScaffold
      testID="warehouse-assign-sheet"
      title={t('catalog:warehouseAssign.title')}
      cancelLabel={t('common:close')}
      onCancel={() => void leave()}
      // Ô tìm + "Chọn tất cả" ghim trên vùng cuộn: cuộn danh sách kho thì hai hàng này đứng yên.
      top={
        states.length === 0 ? undefined : (
          <>
            <SearchField
              value={text}
              onChangeText={setText}
              placeholder={t('catalog:warehouseAssign.searchPlaceholder')}
              shape="pill"
              raised
            />
            <PickSelectAllBar
              items={items}
              checked={checked}
              capacityLeft={capacityLeft}
              onSelectMany={selectMany}
              selectedCount={valid.length}
            />
          </>
        )
      }
      bottom={
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
          <Button
            variant="accent"
            capsule
            disabled={valid.length === 0 || busy}
            loading={busy}
            onPress={() => void send()}
          >
            {t('catalog:warehouseAssign.addCount', { count: valid.length })}
          </Button>
        </View>
      }
    >
      <View style={{ gap: 12, paddingTop: 4 }}>
        {failLines ? <ErrorBox lines={failLines} /> : null}
        {states.length === 0 ? (
          <Text muted size={14} style={{ paddingHorizontal: 4 }}>
            {t('catalog:warehouseAssign.empty')}
          </Text>
        ) : pickable.size === 0 ? (
          <Text muted size={14} style={{ paddingHorizontal: 4 }}>
            {t('catalog:warehouseAssign.onlyInactive')}
          </Text>
        ) : null}
        {states.length === 0 ? null : (
          <MaterialPickList
            items={items}
            checked={checked}
            onToggle={toggle}
            capacityLeft={capacityLeft}
            capacityLabel=""
            empty={
              <Text muted style={{ textAlign: 'center', paddingTop: 16 }}>
                {t('catalog:warehouseAssign.noMatch')}
              </Text>
            }
          />
        )}
      </View>
    </SheetScaffold>
  )
}
