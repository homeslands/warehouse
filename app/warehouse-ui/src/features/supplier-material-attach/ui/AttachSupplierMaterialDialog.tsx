import { PackagePlusIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Combobox, type ComboboxOption } from '@/shared/ui/Combobox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { DialogIcon } from '@/shared/ui/DialogIcon'
import { Label } from '@/shared/ui/label'
import { materialKeys, useMaterialOptions } from '@/entities/material'
import { useAllSupplierMaterials, useAttachSupplierMaterial } from '@/entities/supplier'

/** Lỗi thuộc về ô chọn vật tư (đã thuộc NCC khác / chưa gắn) — hiện ngay trong hộp. */
const FIELD_CODES = new Set([101212, 101213])

type Props = {
  /** `null` = đóng. */
  supplier: { slug: string; code: string } | null
  onOpenChange: (open: boolean) => void
}

/** Gắn một vật tư vào nhà cung cấp (`PUT /suppliers/{slug}/materials/{materialSlug}`). */
export function AttachSupplierMaterialDialog({ supplier, onOpenChange }: Props) {
  const { t } = useTranslation(['suppliers', 'common'])
  const qc = useQueryClient()
  const attach = useAttachSupplierMaterial()
  const open = supplier !== null
  // Chỉ tải khi hộp mở — tab Vật tư đã có bảng riêng, không cần danh sách ứng viên.
  const materials = useMaterialOptions({ enabled: open })
  const attached = useAllSupplierMaterials(supplier?.slug ?? '', { enabled: open })

  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [fieldError, setFieldError] = useState<string | null>(null)
  // Giữ mã cuối khi hộp đang mờ dần — tiêu đề không mất chữ.
  const [lastCode, setLastCode] = useState(supplier?.code)
  if (supplier !== null && supplier.code !== lastCode) setLastCode(supplier.code)

  const slug = supplier?.slug
  useEffect(() => {
    if (slug !== undefined) {
      setSelected(undefined)
      setFieldError(null)
    }
  }, [slug])

  const isLoading = materials.isPending || attached.isPending
  // Lỗi tải ứng viên: nói rõ thay vì "Không còn vật tư nào để gắn" (sai sự thật) và khoá nút Gắn.
  const loadError = materials.isError ? materials.error : attached.isError ? attached.error : null

  const attachedSlugs = new Set((attached.data?.items ?? []).map((m) => m.slug))
  const options: ComboboxOption[] = (materials.data?.items ?? [])
    .filter((m) => !attachedSlugs.has(m.slug))
    .map((m) => ({
      value: m.slug,
      label: `${m.code} · ${m.name}${m.baseUnitName ? ` · ${m.baseUnitName}` : ''}`,
    }))

  const submit = () => {
    if (!supplier || selected === undefined) return
    setFieldError(null)
    attach.mutate(
      { slug: supplier.slug, materialSlug: selected },
      {
        onSuccess: () => {
          // Vật tư đổi nhà cung cấp → danh sách vật tư (entity material) cũng phải tải lại.
          void qc.invalidateQueries({ queryKey: materialKeys.all })
          onOpenChange(false)
        },
        onError: (error) => {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // `Dialog.Close` gọi thẳng `onOpenChange` nên nút × vượt được chốt isPending — giấu nó lúc
        // đang gửi để không còn lối đóng nào lọt qua.
        showCloseButton={!attach.isPending}
        onEscapeKeyDown={(event) => {
          if (attach.isPending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (attach.isPending) event.preventDefault()
        }}
      >
        <DialogHeader className="items-center text-center">
          <DialogIcon>
            <PackagePlusIcon />
          </DialogIcon>
          <DialogTitle>{t('suppliers:attachMaterialTitle', { code: lastCode ?? '' })}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="supplier-material">{t('suppliers:columnMaterial')}</Label>
          <Combobox
            id="supplier-material"
            options={options}
            value={selected}
            onChange={(next) => {
              setSelected(next)
              setFieldError(null)
            }}
            disabled={attach.isPending || isLoading || loadError !== null}
            placeholder={isLoading ? t('common:loading') : t('suppliers:materialPlaceholder')}
            emptyText={t('suppliers:noMaterialCandidate')}
            aria-invalid={fieldError !== null || loadError !== null}
          />
          {loadError !== null && (
            <p role="alert" className="text-destructive text-sm">
              {resolveApiErrorMessage(loadError)}
            </p>
          )}
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
            disabled={attach.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common:cancel')}
          </Button>
          <Button
            type="button"
            size="xl"
            disabled={attach.isPending || selected === undefined || loadError !== null}
            onClick={submit}
          >
            {attach.isPending ? t('common:saving') : t('suppliers:attach')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
