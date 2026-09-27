import { WarehouseIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Combobox, type ComboboxOption } from '@/shared/ui/Combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { DialogIcon } from '@/shared/ui/DialogIcon'
import { Label } from '@/shared/ui/label'
import { storeKeys, useAssignStoreWarehouse, type Store } from '@/entities/store'
import { useWarehouses, warehouseKeys } from '@/entities/warehouse'

/** Lỗi thuộc về ô chọn kho — hiện ngay trong hộp. Còn lại (404) đi toast. */
const FIELD_CODES = new Set([101018, 101019, 101020])

/** Ô chọn phải thấy đủ kho; không phân trang được trong một combobox. */
const WAREHOUSE_PAGE_SIZE = 100

type Props = {
  /** `null` = đóng. */
  store: Store | null
  /**
   * Kho đã bị cửa hàng khác chiếm, tính từ trang dữ liệu cửa hàng đang hiển thị. Danh sách này có
   * thể CŨ (cửa hàng ở trang khác, người khác vừa gán) — backend vẫn là nơi quyết định, lỗi
   * 101019/101020 hiện ngay tại ô chọn.
   */
  assignedWarehouseSlugs: string[]
  onOpenChange: (open: boolean) => void
}

export function AssignStoreWarehouseDialog({ store, assignedWarehouseSlugs, onOpenChange }: Props) {
  const { t } = useTranslation(['stores', 'common'])
  const qc = useQueryClient()
  const assign = useAssignStoreWarehouse()
  // Chỉ tải khi hộp mở — màn danh sách cửa hàng không cần danh sách kho.
  const warehousesQuery = useWarehouses(
    { page: 1, size: WAREHOUSE_PAGE_SIZE, isActive: true },
    { enabled: store !== null },
  )

  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    if (store) {
      setSelected(store.warehouseSlug)
      setFieldError(null)
    }
  }, [store])

  // Backend chỉ cho gán kho đang hoạt động (101018) và chưa thuộc cửa hàng nào (101019) — lọc sẵn
  // để người dùng không chọn thứ chắc chắn bị từ chối. Kho của CHÍNH cửa hàng này vẫn phải còn.
  const taken = new Set(assignedWarehouseSlugs.filter((slug) => slug !== store?.warehouseSlug))
  const options: ComboboxOption[] = (warehousesQuery.data?.items ?? [])
    .filter((warehouse) => warehouse.isActive && !taken.has(warehouse.slug))
    .map((warehouse) => ({ value: warehouse.slug, label: warehouse.name }))

  const submit = (warehouseSlug: string | null) => {
    if (!store) return
    setFieldError(null)
    assign.mutate(
      { slug: store.slug, input: { warehouseSlug } },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          // Cả hai danh sách đều đã cũ: kho vừa bị chiếm/được trả tự do, cửa hàng kia cũng đổi.
          // "Kho còn trống" ở StoresPage tính từ `warehouseSlug` của TỪNG DÒNG CỬA HÀNG đang hiển
          // thị (kho không mang trường "thuộc cửa hàng nào") — chỉ tải lại `warehouseKeys.all` thì
          // ô chọn vẫn gợi ý đúng kho vừa bị 101019/101020 từ chối; phải tải lại `storeKeys.all`
          // nữa để trang tính lại `assignedWarehouseSlugs`.
          void qc.invalidateQueries({ queryKey: warehouseKeys.all })
          void qc.invalidateQueries({ queryKey: storeKeys.all })
          if (isApiError(error) && error.code !== undefined && FIELD_CODES.has(error.code)) {
            setFieldError(resolveApiErrorMessage(error))
            return
          }
          toastApiError(error)
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={store !== null} onOpenChange={onOpenChange}>
      <DialogContent
        // `Dialog.Close` của Radix gọi thẳng `onOpenChange`, KHÔNG đi qua `onEscapeKeyDown` /
        // `onPointerDownOutside` — nút × vì thế vượt được chốt isPending. Giấu nó lúc đang gửi để
        // không còn lối đóng nào lọt qua (cùng quy ước với AssignWarehouseManagerDialog).
        showCloseButton={!assign.isPending}
        onEscapeKeyDown={(event) => {
          if (assign.isPending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (assign.isPending) event.preventDefault()
        }}
      >
        <DialogHeader className="items-center text-center">
          <DialogIcon>
            <WarehouseIcon />
          </DialogIcon>
          <DialogTitle>{t('stores:assignWarehouseTitle')}</DialogTitle>
          <DialogDescription>{store?.name}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="store-warehouse">{t('stores:fieldWarehouse')}</Label>
          <Combobox
            id="store-warehouse"
            options={options}
            value={selected}
            onChange={setSelected}
            disabled={assign.isPending}
            placeholder={
              warehousesQuery.isPending ? t('common:loading') : t('stores:warehousePlaceholder')
            }
            emptyText={t('stores:noWarehouseAvailable')}
            aria-invalid={fieldError !== null}
          />
          {fieldError !== null && (
            <p role="alert" className="text-destructive text-sm">
              {fieldError}
            </p>
          )}
        </div>

        <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
          <Button
            type="button"
            variant="outline"
            size="xl"
            disabled={assign.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common:cancel')}
          </Button>
          {store?.warehouseSlug !== undefined && (
            <Button
              type="button"
              variant="outline"
              size="xl"
              disabled={assign.isPending}
              onClick={() => submit(null)}
            >
              {t('stores:unassignAction')}
            </Button>
          )}
          <Button
            type="button"
            size="xl"
            disabled={assign.isPending || selected === undefined}
            onClick={() => submit(selected ?? null)}
          >
            {assign.isPending ? t('common:saving') : t('common:save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
