import { PackagePlusIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError } from '@/shared/api/http'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { matchesSearch } from '@/shared/lib/search-text'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { DialogIcon } from '@/shared/ui/DialogIcon'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Skeleton } from '@/shared/ui/skeleton'
import { materialKeys, useMaterialOptions } from '@/entities/material'
import { useAllSupplierMaterials, useAttachSupplierMaterial } from '@/entities/supplier'

/** Cả lô bị từ chối (BE "tất cả hoặc không"): đã thuộc NCC khác / vật tư không còn tồn tại — báo ngay trong hộp. */
const BELONGS_TO_OTHER = 101212
const MATERIAL_NOT_FOUND = 100701

type Props = {
  /** `null` = đóng. */
  supplier: { slug: string; code: string } | null
  onOpenChange: (open: boolean) => void
}

/**
 * Gắn nhiều vật tư vào nhà cung cấp một lần (`PUT /suppliers/{slug}/materials`, `{ materialSlugs }`). Ứng viên = 100
 * vật tư đầu trừ vật tư đã gắn với chính NCC này (giới hạn lô của BE cũng là 100). BE làm "tất cả hoặc không" và
 * không nói vật tư nào hỏng — chọn nhiều mà bị từ chối thì câu báo nói rõ là CHƯA gắn gì.
 */
export function AttachSupplierMaterialDialog({ supplier, onOpenChange }: Props) {
  const { t } = useTranslation(['suppliers', 'common'])
  const qc = useQueryClient()
  const attach = useAttachSupplierMaterial()
  const searchId = useId()
  const open = supplier !== null
  // Chỉ tải khi hộp mở — tab Vật tư đã có bảng riêng, không cần danh sách ứng viên.
  const materials = useMaterialOptions({ enabled: open })
  const attached = useAllSupplierMaterials(supplier?.slug ?? '', { enabled: open })

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  // Giữ mã cuối khi hộp đang mờ dần — tiêu đề không mất chữ.
  const [lastCode, setLastCode] = useState(supplier?.code)
  if (supplier !== null && supplier.code !== lastCode) setLastCode(supplier.code)

  const slug = supplier?.slug
  useEffect(() => {
    if (slug !== undefined) {
      setSelected(new Set())
      setQuery('')
      setFieldError(null)
    }
  }, [slug])

  const isLoading = materials.isPending || attached.isPending
  // Lỗi tải ứng viên: nói rõ thay vì "Không còn vật tư nào để gắn" (sai sự thật) và khoá nút Gắn.
  const loadError = materials.isError ? materials.error : attached.isError ? attached.error : null

  const attachedSlugs = new Set((attached.data?.items ?? []).map((m) => m.slug))
  const candidates = (materials.data?.items ?? []).filter((m) => !attachedSlugs.has(m.slug))
  const shown = candidates.filter((m) => matchesSearch(`${m.code} ${m.name}`, query))
  const allShownSelected = shown.length > 0 && shown.every((m) => selected.has(m.slug))
  const someShownSelected = shown.some((m) => selected.has(m.slug))
  const busy = attach.isPending

  const update = (next: Set<string>) => {
    setSelected(next)
    setFieldError(null)
  }
  const toggle = (materialSlug: string) => {
    const next = new Set(selected)
    if (!next.delete(materialSlug)) next.add(materialSlug)
    update(next)
  }
  const toggleAllShown = () => {
    const next = new Set(selected)
    for (const m of shown) {
      if (allShownSelected) next.delete(m.slug)
      else next.add(m.slug)
    }
    update(next)
  }

  const submit = () => {
    if (!supplier || selected.size === 0) return
    setFieldError(null)
    attach.mutate(
      { slug: supplier.slug, materialSlugs: [...selected] },
      {
        onSuccess: () => {
          // Vật tư đổi nhà cung cấp → danh sách vật tư (entity material) cũng phải tải lại.
          void qc.invalidateQueries({ queryKey: materialKeys.all })
          onOpenChange(false)
        },
        onError: (error) => {
          const code = isApiError(error) ? error.code : undefined
          if (code === BELONGS_TO_OTHER || code === MATERIAL_NOT_FOUND) {
            // Một vật tư: câu của mã lỗi là đủ rõ. Nhiều vật tư: BE không nói cái nào — nói rõ cả lô chưa gắn.
            setFieldError(
              selected.size === 1
                ? resolveApiErrorMessage(error)
                : t(
                    code === BELONGS_TO_OTHER
                      ? 'suppliers:attachBatchBelongsToOther'
                      : 'suppliers:attachBatchNotFound',
                  ),
            )
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
        className="sm:max-w-md"
        // `Dialog.Close` gọi thẳng `onOpenChange` nên nút × vượt được chốt isPending — giấu nó lúc
        // đang gửi để không còn lối đóng nào lọt qua.
        showCloseButton={!busy}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <DialogHeader className="items-center text-center">
          <DialogIcon>
            <PackagePlusIcon />
          </DialogIcon>
          <DialogTitle>{t('suppliers:attachMaterialTitle', { code: lastCode ?? '' })}</DialogTitle>
        </DialogHeader>

        <div className="grid min-w-0 gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor={searchId}>{t('suppliers:columnMaterial')}</Label>
            <span className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
              {t('suppliers:selectedCount', { count: selected.size })}
            </span>
          </div>
          <Input
            id={searchId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('suppliers:materialSearchPlaceholder')}
            disabled={busy || isLoading || loadError !== null}
            autoComplete="off"
          />

          <div
            role="group"
            aria-label={t('suppliers:materialListLabel')}
            aria-busy={isLoading}
            aria-invalid={fieldError !== null || loadError !== null}
            className="max-h-64 overflow-y-auto rounded-md border"
          >
            {isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-5" />
                <Skeleton className="h-5" />
                <Skeleton className="h-5" />
              </div>
            ) : loadError !== null ? null : candidates.length === 0 ? (
              <p className="text-muted-foreground p-3 text-sm">
                {t('suppliers:noMaterialCandidate')}
              </p>
            ) : shown.length === 0 ? (
              <p className="text-muted-foreground p-3 text-sm">{t('common:noResults')}</p>
            ) : (
              <>
                {shown.length > 1 && (
                  <label className="bg-muted/50 hover:bg-muted flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm font-medium">
                    <Checkbox
                      checked={
                        allShownSelected ? true : someShownSelected ? 'indeterminate' : false
                      }
                      onCheckedChange={toggleAllShown}
                      disabled={busy}
                    />
                    {t('suppliers:selectAllShown', { count: shown.length })}
                  </label>
                )}
                {shown.map((m) => (
                  <label
                    key={m.slug}
                    className="hover:bg-muted flex cursor-pointer items-start gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(m.slug)}
                      onCheckedChange={() => toggle(m.slug)}
                      disabled={busy}
                    />
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{m.code}</span> · {m.name}
                      {/* Khoảng trắng nằm NGOÀI span: khoảng trắng đầu span bị cắt khi tính tên khả truy cập. */}
                      {m.baseUnitName && (
                        <>
                          {' '}
                          <span className="text-muted-foreground">· {m.baseUnitName}</span>
                        </>
                      )}
                    </span>
                  </label>
                ))}
              </>
            )}
          </div>

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
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('common:cancel')}
          </Button>
          <Button
            type="button"
            size="xl"
            disabled={busy || selected.size === 0 || loadError !== null}
            onClick={submit}
          >
            {busy
              ? t('common:saving')
              : selected.size > 0
                ? t('suppliers:attachCount', { count: selected.size })
                : t('suppliers:attach')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
