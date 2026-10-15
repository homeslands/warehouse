import { useQueryClient } from '@tanstack/react-query'
import { PackagePlusIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { DialogIcon } from '@/shared/ui/DialogIcon'
import { Input } from '@/shared/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { importFormKeys } from '@/entities/import-form'
import { materialKeys, type Material } from '@/entities/material'
import { supplierKeys } from '@/entities/supplier'
import { AssignExistingSection } from './AssignExistingSection'
import { CreateMaterialSection } from './CreateMaterialSection'
import { codeNameLabel, type AddedMaterial, type MaterialAddAbilities } from '../model/material-add'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseSlug: string
  warehouseName: string
  initialSearch: string
  availableSlugs: string[]
  abilities: MaterialAddAbilities
  /** Gọi SAU KHI `available-materials` của kho đã tải lại; kèm nhãn + đơn vị gốc để dòng chọn ngay. */
  onAdded: (added: AddedMaterial) => void
}

type DialogTab = 'catalog' | 'create'

const toAddedMaterial = (m: Material): AddedMaterial => ({
  slug: m.slug,
  label: codeNameLabel(m.code, m.name),
  baseUnit: m.baseUnit
    ? { slug: m.baseUnit.slug, label: codeNameLabel(m.baseUnit.code, m.baseUnit.name) }
    : null,
})

/**
 * Hộp "Thêm vật tư vào kho" mở từ ô chọn vật tư của dòng phiếu nhập, hai tab: "Chọn từ danh mục" (tìm + gắn vào kho) và
 * "Tạo vật tư mới" (tạo + gắn kho, + NCC; nút gửi ở chân hộp). Nội dung remount mỗi lần mở (`session`) để ô tìm / form không giữ dữ liệu lần trước.
 */
export function AddWarehouseMaterialDialog(props: Props) {
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(props.open)
  if (props.open !== wasOpen) {
    setWasOpen(props.open)
    if (props.open) setSession((s) => s + 1)
  }
  return <DialogBody key={session} {...props} />
}

function DialogBody({
  open,
  onOpenChange,
  warehouseSlug,
  warehouseName,
  initialSearch,
  availableSlugs,
  abilities,
  onAdded,
}: Props) {
  const { t } = useTranslation(['importForms', 'common'])
  const qc = useQueryClient()
  const [search, setSearch] = useState(initialSearch)
  const [tab, setTab] = useState<DialogTab>('catalog')
  const [creating, setCreating] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [assignBusy, setAssignBusy] = useState(false)
  const busy = createBusy || assignBusy
  const createFormId = useId()
  const createHintId = useId()

  /** Chờ danh sách vật tư của kho tải lại rồi mới báo bên gọi — dòng chọn xong phải có đủ đơn vị. */
  const finish = async (
    name: string,
    added: AddedMaterial,
    toastKey:
      | 'importForms:assignedToast'
      | 'importForms:alreadyInWarehouseToast'
      | 'importForms:createdToast',
    supplierFailed = false,
  ) => {
    await qc.invalidateQueries({ queryKey: importFormKeys.available(warehouseSlug) })
    void qc.invalidateQueries({ queryKey: materialKeys.all })
    const message = t(toastKey, { name })
    if (toastKey === 'importForms:alreadyInWarehouseToast') toast.info(message)
    else toast.success(message)
    if (supplierFailed) toast.warning(t('importForms:supplierAttachFailed'))
    onAdded(added)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={!busy}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
      >
        <DialogHeader className="items-center text-center">
          <DialogIcon>
            <PackagePlusIcon />
          </DialogIcon>
          <DialogTitle>{t('importForms:addMaterialTitle')}</DialogTitle>
          <DialogDescription>
            {t('importForms:addMaterialDescription', { warehouse: warehouseName })}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(next) => {
            const value = next as DialogTab
            // Form tạo lấy chữ đang tìm làm giá trị đầu ở LẦN ĐẦU mở tab; sau đó giữ nguyên khi qua lại giữa hai tab.
            if (value === 'create' && creating === null) setCreating(search)
            setTab(value)
          }}
          className="min-h-0 gap-4"
        >
          <TabsList className="w-full">
            <TabsTrigger value="catalog" className="flex-1" disabled={busy}>
              {t('importForms:catalogTab')}
            </TabsTrigger>
            <TabsTrigger value="create" className="flex-1" disabled={busy}>
              {t('importForms:createMaterialSection')}
            </TabsTrigger>
          </TabsList>

          {/* Hai tab chung một chiều cao cố định (phần dư cuộn bên trong) — đổi tab không làm hộp co giãn / nhảy vị trí. */}
          <div className="h-[min(20rem,50vh)]">
            <TabsContent value="catalog" className="flex h-full flex-col gap-4">
              <Input
                aria-label={t('importForms:addMaterialSearch')}
                placeholder={t('importForms:addMaterialSearch')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
              {/* `-m-1 p-1`: vùng cuộn cắt theo mép padding — chừa chỗ cho viền focus (ring-3) của nút sát mép. */}
              <div className="-m-1 min-h-0 flex-1 overflow-y-auto p-1">
                <AssignExistingSection
                  warehouseSlug={warehouseSlug}
                  search={search}
                  availableSlugs={availableSlugs}
                  canAssign={abilities.assign}
                  locked={busy}
                  onBusyChange={setAssignBusy}
                  onAssigned={(m, alreadyInWarehouse) =>
                    finish(
                      m.name,
                      toAddedMaterial(m),
                      alreadyInWarehouse
                        ? 'importForms:alreadyInWarehouseToast'
                        : 'importForms:assignedToast',
                    )
                  }
                />
              </div>
            </TabsContent>

            {creating !== null && (
              // Giữ mount khi sang tab kia để không mất phần đã nhập.
              <TabsContent
                value="create"
                forceMount
                // `-m-1 p-1` (chỗ cho viền focus) nên cao thêm 0.5rem để chiếm đúng bằng tab danh mục.
                className="-m-1 h-[calc(100%+0.5rem)] overflow-y-auto p-1 data-[state=inactive]:hidden"
              >
                <CreateMaterialSection
                  formId={createFormId}
                  hintId={createHintId}
                  warehouseSlug={warehouseSlug}
                  initialSearch={creating}
                  canCreate={abilities.create}
                  canAttachSupplier={abilities.attachSupplier}
                  onBusyChange={setCreateBusy}
                  onWarehouseInactive={() => onOpenChange(false)}
                  onCreated={async (added, name, supplierAttached) => {
                    if (supplierAttached !== null)
                      void qc.invalidateQueries({ queryKey: supplierKeys.all })
                    await finish(
                      name,
                      added,
                      'importForms:createdToast',
                      supplierAttached === false,
                    )
                  }}
                />
              </TabsContent>
            )}
          </div>
        </Tabs>

        <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
          <Button
            type="button"
            variant="outline"
            size="xl"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('common:close')}
          </Button>
          {tab === 'create' && (
            <Button
              type="submit"
              form={createFormId}
              size="xl"
              disabled={!abilities.create || busy}
              aria-describedby={abilities.create ? undefined : createHintId}
            >
              {createBusy ? t('importForms:creatingMaterial') : t('importForms:createAndAssign')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
