import { ListChecksIcon } from 'lucide-react'
import { useId, useState, type ReactNode, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { toCodeOrNameQuery } from '@/shared/lib/code'
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
import { NameList } from '@/shared/ui/NameList'
import {
  AVAILABLE_MATERIALS_PRELOAD,
  useAvailableMaterialSearch,
  type AvailableMaterial,
} from '@/entities/import-form'
import { baseUnitOf, IMPORT_FORM_ITEMS_MAX } from '../model/import-form-editor.schema'
import { splitBySupplier } from '../model/material-groups'
import { useDebouncedValue } from './useDebouncedValue'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseSlug: string
  /** Vật tư khả dụng tải sẵn của kho — hiện khi ô tìm trống; có chữ thì tìm phía BE. */
  materials: AvailableMaterial[]
  /** Bên bán đầu phiếu: có → nhóm "Hàng thường mua của …" trước, "Vật tư khác" sau. */
  headerSupplierSlug?: string
  supplierName: (slug: string) => string
  /** Vật tư đã có trong phiếu (bất kỳ đơn vị) → không tick được, nhãn "đã có". */
  existingSlugs: ReadonlySet<string>
  /** Số vật tư còn tick được (= 200 − số dòng đã có vật tư). */
  capacity: number
  /** Vật tư đã tick, theo thứ tự hiển thị. Hộp tự đóng sau đó. */
  onConfirm: (picked: AvailableMaterial[]) => void
  /** "＋ Thêm vật tư vào kho…" do bên gọi dựng (hộp thêm vật tư đến qua prop của trang). */
  addMaterialFooter?: (search: string) => ReactNode
  /** Phần tử gốc của hộp — bên gọi dùng để trả focus vào hộp khi hộp thêm vật tư (chồng lên) đóng. */
  contentRef?: Ref<HTMLDivElement>
}

/**
 * Ô tick | vật tư | tồn | đơn vị | NCC từ `lg` (hộp rộng 5xl); hẹp hơn thì ba cột sau xuống dòng dưới tên. Từ `sm` như
 * trước thì hộp chỉ 3xl và ở 720px cột tên còn ~15 ký tự một dòng, số tồn gãy giữa chữ số (break-ui 2026-10-24).
 */
const ROW_GRID =
  'grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 lg:grid-cols-[1rem_minmax(0,1fr)_11rem_8rem_12rem]'
const SIDE_CELL = 'text-muted-foreground col-start-2 min-w-0 text-xs lg:col-start-auto lg:pt-0.5'

/** Hộp chọn nhiều vật tư một lần: mỗi vật tư tick thành một dòng của phiếu với đơn vị gốc. */
export function ImportFormMaterialPicker({
  open,
  onOpenChange,
  warehouseSlug,
  materials,
  headerSupplierSlug = '',
  supplierName,
  existingSlugs,
  capacity,
  onConfirm,
  addMaterialFooter,
  contentRef,
}: Props) {
  const { t } = useTranslation(['importForms', 'inventory', 'common'])
  const id = useId()
  const [search, setSearch] = useState('')
  // Giữ vật tư đã tick (kể cả khi đổi từ khoá làm nó khuất khỏi danh sách).
  const [checked, setChecked] = useState<ReadonlyMap<string, AvailableMaterial>>(new Map())
  // Mở lại → bắt đầu lại: bỏ chọn, ô tìm trống.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSearch('')
      setChecked(new Map())
    }
  }

  const debounced = useDebouncedValue(search.trim(), 300)
  const searching = search.trim() !== ''
  const result = useAvailableMaterialSearch(warehouseSlug, toCodeOrNameQuery(debounced), {
    enabled: open && searching && debounced !== '',
  })
  const loading = searching && (result.isFetching || debounced !== search.trim())
  const source = searching ? (result.data?.items ?? []) : materials

  const { usual, rest } = splitBySupplier(source, headerSupplierSlug)
  const groups = headerSupplierSlug
    ? [
        {
          heading: t('importForms:groupSupplierMaterials', {
            name: supplierName(headerSupplierSlug),
          }),
          items: usual,
        },
        { heading: t('importForms:groupOtherMaterials'), items: rest },
      ].filter((g) => g.items.length > 0)
    : [{ heading: '', items: rest }]
  const shown = groups.flatMap((g) => g.items)

  const full = checked.size >= capacity
  const limitId = `${id}-limit`
  const tickable = (m: AvailableMaterial) => !existingSlugs.has(m.slug) && !!baseUnitOf(m)
  // Câu giới hạn hiện khi giới hạn có thể chặn thật: còn ít chỗ hơn số vật tư tick được (đang hiện + đã tick).
  const shownTickable = shown.filter(tickable)
  const selectable = new Set([...shownTickable.map((m) => m.slug), ...checked.keys()])
  const showLimit = capacity < selectable.size

  // "Chọn tất cả" chỉ áp cho danh sách đang hiện (kể cả kết quả tìm). Coi là "đã chọn hết" khi mọi vật tư tick được đang
  // hiện đều đã tick, hoặc đã hết chỗ mà có ít nhất một vật tư đang hiện được tick — khi đó bấm lại là bỏ chọn.
  const checkedShown = shownTickable.filter((m) => checked.has(m.slug)).length
  const allChosen =
    checkedShown > 0 && (checkedShown === shownTickable.length || checked.size >= capacity)
  const selectAllState = allChosen ? true : checkedShown > 0 ? 'indeterminate' : false
  const selectAllDisabled = shownTickable.length === 0 || (checkedShown === 0 && full)
  const toggleAll = () =>
    setChecked((prev) => {
      const next = new Map(prev)
      if (allChosen) {
        for (const m of shownTickable) next.delete(m.slug)
        return next
      }
      // Theo thứ tự hiển thị, tới khi hết chỗ.
      for (const m of shownTickable) {
        if (next.size >= capacity) break
        if (!next.has(m.slug)) next.set(m.slug, m)
      }
      return next
    })

  const toggle = (m: AvailableMaterial, on: boolean) =>
    setChecked((prev) => {
      const next = new Map(prev)
      if (!on) next.delete(m.slug)
      else if (next.size < capacity) next.set(m.slug, m)
      return next
    })

  const confirm = () => {
    // Thứ tự KHÔNG phụ thuộc ô tìm đang gõ: theo danh sách tải sẵn khi ô tìm trống (đã nhóm), rồi tới vật tư chỉ có trong
    // kết quả tìm, theo thứ tự tick (Map giữ thứ tự thêm, sort ổn định).
    const preloaded = splitBySupplier(materials, headerSupplierSlug)
    const order = new Map(
      [...preloaded.usual, ...preloaded.rest].map((m, i): [string, number] => [m.slug, i]),
    )
    const rank = (slug: string) => order.get(slug) ?? order.size
    const picked = [...checked.values()]
      .filter((m) => !existingSlugs.has(m.slug))
      .sort((a, b) => rank(a.slug) - rank(b.slug))
    onConfirm(picked)
    onOpenChange(false)
  }

  const renderRow = (m: AvailableMaterial) => {
    const base = baseUnitOf(m)
    const already = existingSlugs.has(m.slug)
    const isChecked = checked.has(m.slug)
    const locked = already || !base || (!isChecked && full)
    const boxId = `${id}-${m.slug}`
    const hint = already
      ? t('importForms:pickerAlreadyAdded')
      : !base
        ? t('inventory:noBaseUnit')
        : undefined
    return (
      <li key={m.slug} data-testid={`picker-row-${m.slug}`} className={`${ROW_GRID} px-3 py-2.5`}>
        <Checkbox
          id={boxId}
          className="mt-0.5"
          checked={isChecked}
          disabled={locked}
          aria-describedby={
            hint ? `${boxId}-hint` : !isChecked && full && showLimit ? limitId : undefined
          }
          onCheckedChange={(value) => toggle(m, value === true)}
        />
        <div className="min-w-0">
          <label
            htmlFor={boxId}
            className={`block text-sm break-words ${locked ? 'text-muted-foreground' : 'cursor-pointer'}`}
          >
            <span className="font-semibold">{m.code}</span> · {m.name}
          </label>
          {hint && (
            <p id={`${boxId}-hint`} className="text-muted-foreground text-xs">
              {hint}
            </p>
          )}
        </div>
        {/* Số không bao giờ gãy giữa chữ số; chỉ xuống dòng ở khoảng trắng trước đơn vị. */}
        <span className={`${SIDE_CELL} tabular-nums lg:text-right`}>
          <span className="lg:sr-only">{t('importForms:pickerColStock')}: </span>
          <span className="whitespace-nowrap">{formatQuantity(m.quantity)}</span>{' '}
          <span className="break-words">{base?.unitCode ?? ''}</span>
        </span>
        <span className={`${SIDE_CELL} break-words`}>
          <span className="lg:sr-only">{t('importForms:pickerColUnits')}: </span>
          <span>{m.units.map((u) => u.unitCode).join(', ')}</span>
        </span>
        {/* Tên pháp nhân NCC thường rất dài → 1 tên (tối đa 2 dòng) + "+N" luôn hiện; đủ tên ở title / trình đọc màn hình. */}
        <span className={`${SIDE_CELL} break-words`}>
          {m.suppliers.length > 0 && (
            <>
              <span className="lg:sr-only">{t('importForms:pickerColSuppliers')}: </span>
              <NameList
                names={m.suppliers.map((s) => s.name)}
                max={1}
                nameClassName="line-clamp-2"
              />
            </>
          )}
        </span>
      </li>
    )
  }

  const body = loading ? (
    <p role="status" className="text-muted-foreground px-3 py-6 text-center text-sm">
      {t('importForms:searching')}
    </p>
  ) : searching && result.isError ? (
    <p role="alert" className="text-destructive px-3 py-6 text-center text-sm">
      {t('importForms:materialLoadFailedShort')}
    </p>
  ) : shown.length === 0 ? (
    <p className="text-muted-foreground px-3 py-6 text-center text-sm">
      {t('importForms:materialEmpty')}
    </p>
  ) : (
    groups.map((g) =>
      g.heading ? (
        <div key={g.heading} role="group" aria-label={g.heading}>
          <p
            aria-hidden
            className="text-muted-foreground bg-muted/40 px-3 py-1.5 text-xs font-medium"
          >
            {g.heading}
          </p>
          <ul className="divide-y">{g.items.map(renderRow)}</ul>
        </div>
      ) : (
        <ul key="all" className="divide-y">
          {g.items.map(renderRow)}
        </ul>
      ),
    )
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={contentRef} className="sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader className="items-center text-center">
          <DialogIcon>
            <ListChecksIcon />
          </DialogIcon>
          <DialogTitle>{t('importForms:pickerTitle')}</DialogTitle>
          <DialogDescription>{t('importForms:pickerDescription')}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3">
          <Input
            aria-label={t('importForms:materialSearch')}
            placeholder={t('importForms:materialSearch')}
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
              <span>{t('importForms:fieldMaterial')}</span>
              <span className="text-right">{t('importForms:pickerColStock')}</span>
              <span>{t('importForms:pickerColUnits')}</span>
              <span>{t('importForms:pickerColSuppliers')}</span>
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
                {t('importForms:pickerSelectAll', { count: shownTickable.length })}
              </label>
            </div>
            <div className="max-h-[min(26rem,50vh)] overflow-y-auto">{body}</div>
          </div>
          {showLimit && (
            <p id={limitId} className="text-muted-foreground text-xs">
              {t('importForms:pickerLimit', {
                max: IMPORT_FORM_ITEMS_MAX,
                left: Math.max(0, capacity - checked.size),
              })}
            </p>
          )}
          {/* Hết chỗ thì vật tư vừa thêm cũng không thành dòng được → ẩn lối vào. */}
          {!searching && materials.length >= AVAILABLE_MATERIALS_PRELOAD && (
            <p className="text-muted-foreground text-xs">
              {t('importForms:pickerBrowseLimit', { count: materials.length })}
            </p>
          )}
          {capacity > 0 && addMaterialFooter?.(search.trim())}
        </div>

        <DialogFooter className="flex-row border-t-0 bg-transparent [&>button]:flex-1">
          <Button type="button" variant="outline" size="xl" onClick={() => onOpenChange(false)}>
            {t('common:cancel')}
          </Button>
          <Button type="button" size="xl" disabled={checked.size === 0} onClick={confirm}>
            {t('importForms:pickerAddLines', { count: checked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
