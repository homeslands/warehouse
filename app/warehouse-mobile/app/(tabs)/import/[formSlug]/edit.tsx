import { useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'

import { useHandOffToModal } from '@/shared/lib/useHandOffToModal'

/** Link cũ `/import/[formSlug]/edit` (bước trong tab): chuyển sang modal `/import-form/[formSlug]/edit`. */
export default function LegacyImportItemsStepRoute() {
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const handOff = useHandOffToModal()
  useEffect(() => {
    handOff({ pathname: '/import-form/[formSlug]/edit', params: { formSlug } })
  }, [handOff, formSlug])
  return null
}
