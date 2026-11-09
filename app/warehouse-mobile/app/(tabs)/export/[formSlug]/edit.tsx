import { useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'

import { useHandOffToModal } from '@/shared/lib/useHandOffToModal'

/** Link cũ `/export/[formSlug]/edit` (bước trong tab): chuyển sang modal `/export-form/[formSlug]/edit`. */
export default function LegacyExportItemsStepRoute() {
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const handOff = useHandOffToModal()
  useEffect(() => {
    handOff({ pathname: '/export-form/[formSlug]/edit', params: { formSlug } })
  }, [handOff, formSlug])
  return null
}
