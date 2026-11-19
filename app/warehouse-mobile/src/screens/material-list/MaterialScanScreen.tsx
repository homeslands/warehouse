import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchMaterialByCode, type Material } from '@/entities/material'
import { parseLabel, ScanScreen } from '@/features/scan-material'
import { haptics } from '@/shared/lib/haptics'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'

import { useMaterialFilter } from './filter-store'

/** Vật tư có ĐÚNG mã quét (nguyên chuỗi, rồi phần Mã của nhãn `<MÃ>*<SERIAL>`); lỗi mạng → `null`. */
async function lookup(text: string): Promise<Material | null> {
  const code = parseLabel(text).code
  try {
    return (
      (await fetchMaterialByCode(text)) ??
      (code && code !== text ? await fetchMaterialByCode(code) : null)
    )
  } catch {
    return null
  }
}

/**
 * Route `/scan-catalog-material` — quét mã để tìm vật tư trong danh mục (mở từ nút "Quét mã" của danh
 * sách Vật tư, tab Tài khoản). Toàn màn `ScanScreen`, đọc MỘT lần. Tra danh mục theo mã (khớp CHÍNH XÁC
 * trên máy — `fetchMaterialByCode`): thấy → đóng rồi mở chi tiết vật tư (quay lại là danh sách); không thấy
 * / lỗi mạng → ghi mã (phần Mã của nhãn) vào ô tìm của danh sách (`useMaterialFilter.scannedQuery`) rồi
 * đóng — danh sách tìm theo tên / mã trên server như gõ tay.
 */
export function MaterialScanScreen() {
  const { t } = useTranslation(['catalog'])
  const router = useRouter()
  const closeSheet = useCloseSheet()
  // Đóng đúng MỘT lần: ✕ trong lúc đang tra mã rồi kết quả về không được `back()` thêm.
  const closed = useRef(false)
  const close = () => {
    if (closed.current) return
    closed.current = true
    closeSheet()
  }
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [busy, setBusy] = useState(false)

  const onScanned = async (data: string) => {
    if (closed.current || busy) return
    const text = data.trim()
    if (!text) return
    setBusy(true)
    const found = await lookup(text)
    if (!mounted.current || closed.current) return
    if (found) {
      haptics.success()
      close()
      router.push(`/account/materials/${found.slug}`)
      return
    }
    useMaterialFilter.getState().setScannedQuery(parseLabel(text).code || text)
    close()
  }

  return (
    <ScanScreen
      testID="material-search-scan"
      active={!busy}
      onScanned={(data) => void onScanned(data)}
      onClose={close}
      hint={t('catalog:material.scanHint')}
    />
  )
}
