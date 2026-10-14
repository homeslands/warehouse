import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
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
  /** `supplierAttached`: `null` = không chọn NCC; `false` = tạo + gắn kho xong nhưng gắn NCC lỗi. */
  onCreated: (
    material: { slug: string; name: string },
    supplierAttached: boolean | null,
  ) => Promise<void> | void
  /** Hộp chặn đóng khi đang gửi. */
  onBusyChange: (busy: boolean) => void
  onWarehouseInactive: () => void
}

const label = (code: string, name: string) => `${code} · ${name}`

export function CreateMaterialSection({
  warehouseSlug,
  initialSearch,
  canCreate,
  canAttachSupplier,
  onCreated,
  onBusyChange,
  onWarehouseInactive,
}: Props) {
  const { t } = useTranslation(['importForms', 'common'])
  const hintId = useId()
  const create = useCreateWarehouseMaterial()
  const types = useMaterialTypeOptions({ enabled: canCreate })
  const units = useUnitOptions({ enabled: canCreate })
  const suppliers = useSuppliers({ page: 1, size: 100 }, { enabled: canAttachSupplier })
  const form = useForm<AddMaterialValues>({
    resolver: zodResolver(addMaterialSchema),
    mode: 'onTouched',
    defaultValues: addMaterialDefaults(initialSearch),
  })

  const onSubmit = (values: AddMaterialValues) => {
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
          const material = { slug: item.materialSlug, name: item.materialName }
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
            await onCreated(material, attached)
          } finally {
            onBusyChange(false)
          }
        },
        onError: (error) => {
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
            disabled={!canCreate || create.isPending}
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
