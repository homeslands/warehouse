import { useQueryClient } from '@tanstack/react-query'
import { PackagePlusIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
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
import { Separator } from '@/shared/ui/separator'
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

const toAddedMaterial = (m: Material): AddedMaterial => ({
  slug: m.slug,
  label: codeNameLabel(m.code, m.name),
  baseUnit: m.baseUnit
    ? { slug: m.baseUnit.slug, label: codeNameLabel(m.baseUnit.code, m.baseUnit.name) }
    : null,
})

/**
 * Hộp "Thêm vật tư vào kho" mở từ ô chọn vật tư của dòng phiếu nhập: tìm danh mục + gắn vào kho, hoặc tạo vật tư mới +
 * gắn kho (+ NCC). Nội dung remount mỗi lần mở (`session`) để ô tìm / form không giữ dữ liệu lần trước.
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
  const [creating, setCreating] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [assignBusy, setAssignBusy] = useState(false)
  const busy = createBusy || assignBusy

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

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          <Input
            aria-label={t('importForms:addMaterialSearch')}
            placeholder={t('importForms:addMaterialSearch')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
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
          <Separator />
          {creating === null ? (
            <Button type="button" variant="ghost" onClick={() => setCreating(search)}>
              <PlusIcon aria-hidden />
              {t('importForms:createMaterialSection')}
            </Button>
          ) : (
            <CreateMaterialSection
              warehouseSlug={warehouseSlug}
              initialSearch={creating}
              canCreate={abilities.create}
              canAttachSupplier={abilities.attachSupplier}
              locked={busy}
              onBusyChange={setCreateBusy}
              onWarehouseInactive={() => onOpenChange(false)}
              onCreated={async (added, name, supplierAttached) => {
                if (supplierAttached !== null)
                  void qc.invalidateQueries({ queryKey: supplierKeys.all })
                await finish(name, added, 'importForms:createdToast', supplierAttached === false)
              }}
            />
          )}
        </div>

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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
