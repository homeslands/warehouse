import { ListChecksIcon } from 'lucide-react'
import { useId, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { formatQuantity } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
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
import type { InventoryItem } from '@/entities/inventory'
import { EXPORT_FORM_ITEMS_MAX } from '../model/export-form-editor.schema'
import { EXPORT_STOCK_SIZE, baseUnitSlugOf, filterStock } from '../model/material-search'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Vật tư của kho đã tải sẵn (tối đa `EXPORT_STOCK_SIZE`); ô tìm lọc tại chỗ trên đó. */
  stock: InventoryItem[]
  /** Tổng số vật tư của kho — lớn hơn số đã tải thì ghi chú "Chỉ tìm trong … vật tư đầu". */
  stockTotal: number
  /** Vật tư đã có dòng với lô tự chọn → không tick được, nhãn "đã có". Dòng chọn lô tay vẫn thêm bằng tay được. */
  autoSlugs: ReadonlySet<string>
  /** Số vật tư còn tick được (= 200 − số dòng không trống hẳn). */
  capacity: number
  /** Vật tư đã tick, theo thứ tự của kho. Hộp tự đóng sau đó. */
  onConfirm: (picked: InventoryItem[]) => void
  /** Phần tử gốc của hộp — bên gọi dùng khi cần trả focus. */
  contentRef?: Ref<HTMLDivElement>
}

/** Ô tick | vật tư | khả dụng | đơn vị từ `lg`; hẹp hơn thì hai cột sau xuống dòng dưới tên. */
const ROW_GRID =
  'grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 lg:grid-cols-[1rem_minmax(0,1fr)_11rem_8rem]'
const SIDE_CELL = 'text-muted-foreground col-start-2 min-w-0 text-xs lg:col-start-auto lg:pt-0.5'

/** Hộp chọn nhiều vật tư một lần: mỗi vật tư tick thành một dòng của phiếu xuất (đơn vị gốc, lô tự chọn). */
export function ExportFormMaterialPicker({
  open,
  onOpenChange,
  stock,
  stockTotal,
  autoSlugs,
  capacity,
  onConfirm,
  contentRef,
}: Props) {
  const { t } = useTranslation(['exportForms', 'inventory', 'common'])
  const id = useId()
  const [search, setSearch] = useState('')
  // Giữ vật tư đã tick (kể cả khi đổi từ khoá làm nó khuất khỏi danh sách).
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  // Mở lại → bắt đầu lại: bỏ chọn, ô tìm trống.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSearch('')
      setChecked(new Set())
    }
  }

  const shown = filterStock(stock, search)
  const full = checked.size >= capacity
  const limitId = `${id}-limit`
  const tickable = (m: InventoryItem) =>
    !autoSlugs.has(m.materialSlug) && m.availableQuantity > 0 && baseUnitSlugOf(m) !== ''
  // Câu giới hạn hiện khi giới hạn có thể chặn thật: còn ít chỗ hơn số vật tư tick được (đang hiện + đã tick).
  const shownTickable = shown.filter(tickable)
  const selectable = new Set([...shownTickable.map((m) => m.materialSlug), ...checked])
  const showLimit = capacity < selectable.size

  // "Chọn tất cả" chỉ áp cho danh sách đang lọc. Coi là "đã chọn hết" khi mọi vật tư tick được đang hiện đều đã tick,
  // hoặc đã hết chỗ mà có ít nhất một vật tư đang hiện được tick — khi đó bấm lại là bỏ chọn.
  const checkedShown = shownTickable.filter((m) => checked.has(m.materialSlug)).length
  const allChosen =
    checkedShown > 0 && (checkedShown === shownTickable.length || checked.size >= capacity)
  const selectAllState = allChosen ? true : checkedShown > 0 ? 'indeterminate' : false
  const selectAllDisabled = shownTickable.length === 0 || (checkedShown === 0 && full)
  const toggleAll = () =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (allChosen) {
        for (const m of shownTickable) next.delete(m.materialSlug)
        return next
      }
      // Theo thứ tự của kho, tới khi hết chỗ.
      for (const m of shownTickable) {
        if (next.size >= capacity) break
        next.add(m.materialSlug)
      }
      return next
    })

  const toggle = (slug: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (!on) next.delete(slug)
      else if (next.size < capacity) next.add(slug)
      return next
    })

  const confirm = () => {
    // Thứ tự của kho, không phụ thuộc thứ tự tick hay ô tìm đang gõ.
    onConfirm(stock.filter((m) => checked.has(m.materialSlug) && tickable(m)))
    onOpenChange(false)
  }

  const renderRow = (m: InventoryItem) => {
    const already = autoSlugs.has(m.materialSlug)
    const isChecked = checked.has(m.materialSlug)
    const hasBase = baseUnitSlugOf(m) !== ''
    const empty = m.availableQuantity <= 0
    const locked = already || empty || !hasBase || (!isChecked && full)
    const boxId = `${id}-${m.materialSlug}`
    const hint = already
      ? t('exportForms:pickerAlreadyAdded')
      : empty
        ? t('exportForms:outOfStock')
        : !hasBase
          ? t('inventory:noBaseUnit')
          : undefined
    return (
      <li
        key={m.materialSlug}
        data-testid={`picker-row-${m.materialSlug}`}
        className={`${ROW_GRID} px-3 py-2.5`}
      >
        <Checkbox
          id={boxId}
          className="mt-0.5"
          checked={isChecked}
          disabled={locked}
          aria-describedby={
            hint ? `${boxId}-hint` : !isChecked && full && showLimit ? limitId : undefined
          }
          onCheckedChange={(value) => toggle(m.materialSlug, value === true)}
        />
        <div className="min-w-0">
          <label
            htmlFor={boxId}
            className={`block text-sm break-words ${locked ? 'text-muted-foreground' : 'cursor-pointer'}`}
          >
            <span className="font-semibold">{m.materialCode}</span> · {m.materialName}
          </label>
          {hint && (
            <p id={`${boxId}-hint`} className="text-muted-foreground text-xs">
              {hint}
            </p>
          )}
        </div>
        {/* Số không bao giờ gãy giữa chữ số; chỉ xuống dòng ở khoảng trắng trước đơn vị. */}
        <span className={`${SIDE_CELL} tabular-nums lg:text-right`}>
          <span className="lg:sr-only">{t('exportForms:pickerColAvailable')}: </span>
          <span className="whitespace-nowrap">{formatQuantity(m.availableQuantity)}</span>{' '}
          <span className="break-words">{m.baseUnit?.code ?? ''}</span>
        </span>
        <span className={`${SIDE_CELL} break-words`}>
          <span className="lg:sr-only">{t('exportForms:pickerColUnit')}: </span>
          <span>{m.units.map((u) => u.unitCode).join(', ')}</span>
        </span>
      </li>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={contentRef} className="sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader className="items-center text-center">
          <DialogIcon>
            <ListChecksIcon />
          </DialogIcon>
          <DialogTitle>{t('exportForms:pickerTitle')}</DialogTitle>
          <DialogDescription>{t('exportForms:pickerDescription')}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3">
          <Input
            aria-label={t('exportForms:materialSearch')}
            placeholder={t('exportForms:materialSearch')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
          <div className="overflow-hidden rounded-md border">
            <div
              aria-hidden
              className={`${ROW_GRID} text-muted-foreground hidden border-b px-3 py-2 text-xs lg:grid`}
            >
              <span />
              <span>{t('exportForms:fieldMaterial')}</span>
              <span className="text-right">{t('exportForms:pickerColAvailable')}</span>
              <span>{t('exportForms:pickerColUnit')}</span>
            </div>
            <div className={`${ROW_GRID} bg-muted/40 border-b px-3 py-2`}>
              <Checkbox
                id={`${id}-all`}
                className="mt-0.5"
                checked={selectAllState}
                disabled={selectAllDisabled}
                aria-describedby={selectAllDisabled ? undefined : showLimit ? limitId : undefined}
                onCheckedChange={toggleAll}
              />
              <label
                htmlFor={`${id}-all`}
                className={`text-sm font-medium ${selectAllDisabled ? 'text-muted-foreground' : 'cursor-pointer'}`}
              >
                {t('exportForms:pickerSelectAll', { count: shownTickable.length })}
              </label>
            </div>
            <div className="max-h-[min(26rem,50vh)] overflow-y-auto">
              {shown.length === 0 ? (
                <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                  {t('exportForms:materialEmpty')}
                </p>
              ) : (
                <ul className="divide-y">{shown.map(renderRow)}</ul>
              )}
            </div>
          </div>
          {showLimit && (
            <p id={limitId} className="text-muted-foreground text-xs">
              {t('exportForms:pickerLimit', {
                max: EXPORT_FORM_ITEMS_MAX,
                left: Math.max(0, capacity - checked.size),
              })}
            </p>
          )}
          {stockTotal > EXPORT_STOCK_SIZE && (
            <p className="text-muted-foreground text-xs">
              {t('exportForms:stockLimitNote', { count: EXPORT_STOCK_SIZE })}
            </p>
          )}
        </div>

        <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
          <Button type="button" variant="outline" size="xl" onClick={() => onOpenChange(false)}>
            {t('common:cancel')}
          </Button>
          <Button type="button" size="xl" disabled={checked.size === 0} onClick={confirm}>
            {t('exportForms:pickerAddLines', { count: checked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
