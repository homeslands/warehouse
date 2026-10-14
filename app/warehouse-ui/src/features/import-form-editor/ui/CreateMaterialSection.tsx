import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { applyApiErrorToForm } from '@/shared/lib/form-errors'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Combobox } from '@/shared/ui/Combobox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/ui/form'
import { Input } from '@/shared/ui/input'
import { INVENTORY_WAREHOUSE_INACTIVE, useCreateWarehouseMaterial } from '@/entities/inventory'
import { useMaterialTypeOptions } from '@/entities/material-type'
import { attachSupplierMaterials, useSuppliers } from '@/entities/supplier'
import { useUnitOptions } from '@/entities/unit'
import {
  addMaterialDefaults,
  addMaterialSchema,
  type AddMaterialValues,
} from '../model/add-material.schema'
import { codeNameLabel, type AddedMaterial } from '../model/material-add'

/** Mã lỗi vật tư (1007xx) của phần `material` trong POST → ô tương ứng (như `MaterialFormSheet`). */
const FIELD_BY_CODE = {
  100702: 'name',
  100703: 'code',
  100704: 'code',
  100705: 'code',
  100706: 'code',
  100707: 'typeSlug',
  100601: 'typeSlug',
  100723: 'baseUnitSlug',
  100724: 'baseUnitSlug',
  100901: 'baseUnitSlug',
} as const

type Props = {
  warehouseSlug: string
  initialSearch: string
  canCreate: boolean
  canAttachSupplier: boolean
  /** Hộp đang bận (gắn / tạo, kể cả đoạn sau khi API trả về) — khoá nút tạo. */
  locked?: boolean
  /**
   * `name` = tên server trả về (cho toast). `supplierAttached`: `null` = không chọn NCC; `false` = tạo + gắn kho xong
   * nhưng gắn NCC lỗi.
   */
  onCreated: (
    added: AddedMaterial,
    name: string,
    supplierAttached: boolean | null,
  ) => Promise<void> | void
  /** Hộp chặn đóng khi đang gửi. */
  onBusyChange: (busy: boolean) => void
  onWarehouseInactive: () => void
}

const label = codeNameLabel

export function CreateMaterialSection({
  warehouseSlug,
  initialSearch,
  canCreate,
  canAttachSupplier,
  locked = false,
  onCreated,
  onBusyChange,
  onWarehouseInactive,
}: Props) {
  const { t } = useTranslation(['importForms', 'common'])
  const hintId = useId()
  const create = useCreateWarehouseMaterial()
  const types = useMaterialTypeOptions({ enabled: canCreate })
  const units = useUnitOptions({ enabled: canCreate })
  const suppliers = useSuppliers(
    { page: 1, size: 100 },
    { enabled: canAttachSupplier && canCreate },
  )
  const form = useForm<AddMaterialValues>({
    resolver: zodResolver(addMaterialSchema),
    mode: 'onTouched',
    defaultValues: addMaterialDefaults(initialSearch),
  })

  // `isPending` về false ngay khi POST xong, còn gắn NCC / onCreated vẫn chạy → chốt cả luồng bằng ref.
  const inFlight = useRef(false)

  const onSubmit = (values: AddMaterialValues) => {
    if (inFlight.current) return
    inFlight.current = true
    onBusyChange(true)
    create.mutate(
      {
        warehouseSlug,
        material: {
          code: values.code.trim(),
          name: values.name.trim(),
          typeSlug: values.typeSlug,
          baseUnitSlug: values.baseUnitSlug,
        },
      },
      {
        onSuccess: async (item) => {
          const unitLabel = unitOptions.find((o) => o.value === values.baseUnitSlug)
          const added: AddedMaterial = {
            slug: item.materialSlug,
            label: label(values.code.trim().toUpperCase(), values.name.trim()),
            baseUnit: { slug: values.baseUnitSlug, label: unitLabel?.label ?? values.baseUnitSlug },
          }
          let attached: boolean | null = null
          if (canAttachSupplier && values.supplierSlug !== '') {
            try {
              await attachSupplierMaterials(values.supplierSlug, [item.materialSlug])
              attached = true
            } catch {
              attached = false
            }
          }
          try {
            await onCreated(added, item.materialName, attached)
          } finally {
            inFlight.current = false
            onBusyChange(false)
          }
        },
        onError: (error) => {
          inFlight.current = false
          onBusyChange(false)
          if (isApiError(error) && error.code === INVENTORY_WAREHOUSE_INACTIVE) {
            toastApiError(error)
            onWarehouseInactive()
            return
          }
          if (applyApiErrorToForm(form, error, FIELD_BY_CODE)) return
          toastApiError(error)
        },
      },
    )
  }

  const typeOptions = (types.data?.items ?? []).map((x) => ({
    value: x.slug,
    label: label(x.code, x.name),
  }))
  const unitOptions = (units.data?.items ?? []).map((x) => ({
    value: x.slug,
    label: label(x.code, x.name),
  }))
  const supplierOptions = (suppliers.data?.items ?? []).map((x) => ({
    value: x.slug,
    label: label(x.code, x.name),
  }))

  return (
    <Form {...form}>
      {/* Không lồng <form> trong <form> của FormSheet: hộp nằm trong portal nên DOM không lồng, nhưng vẫn dùng div +
          nút type="button" để Enter trong ô không submit phiếu nhập phía sau. */}
      <div className="space-y-4" role="group" aria-label={t('importForms:createMaterialSection')}>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem required>
                <FormLabel>{t('importForms:fieldMaterialCode')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="off" disabled={!canCreate} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem required>
                <FormLabel>{t('importForms:fieldMaterialName')}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="off" disabled={!canCreate} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="typeSlug"
            render={({ field }) => (
              <FormItem required>
                <FormLabel>{t('importForms:fieldMaterialType')}</FormLabel>
                <FormControl>
                  <Combobox
                    options={typeOptions}
                    value={field.value || undefined}
                    onChange={(v) => field.onChange(v ?? '')}
                    placeholder={t('importForms:typePlaceholder')}
                    disabled={!canCreate}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="baseUnitSlug"
            render={({ field }) => (
              <FormItem required>
                <FormLabel>{t('importForms:fieldBaseUnit')}</FormLabel>
                <FormControl>
                  <Combobox
                    options={unitOptions}
                    value={field.value || undefined}
                    onChange={(v) => field.onChange(v ?? '')}
                    placeholder={t('importForms:baseUnitPlaceholder')}
                    disabled={!canCreate}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {canAttachSupplier && (
            <FormField
              control={form.control}
              name="supplierSlug"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>{t('importForms:fieldSupplierOptional')}</FormLabel>
                  <FormControl>
                    <Combobox
                      options={supplierOptions}
                      value={field.value || undefined}
                      onChange={(v) => field.onChange(v ?? '')}
                      placeholder={t('importForms:supplierPlaceholder')}
                      disabled={!canCreate}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
        <p className="text-muted-foreground text-sm">{t('importForms:createMaterialHint')}</p>
        <div className="space-y-1">
          <Button
            type="button"
            disabled={!canCreate || locked || create.isPending}
            aria-describedby={canCreate ? undefined : hintId}
            onClick={form.handleSubmit(onSubmit)}
          >
            {create.isPending
              ? t('importForms:creatingMaterial')
              : t('importForms:createAndAssign')}
          </Button>
          {!canCreate && (
            <p id={hintId} className="text-muted-foreground text-xs">
              {t('importForms:needCreatePermission')}
            </p>
          )}
        </div>
      </div>
    </Form>
  )
}
