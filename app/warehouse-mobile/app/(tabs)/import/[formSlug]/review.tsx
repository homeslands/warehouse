import { useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'

import { useHandOffToModal } from '@/shared/lib/useHandOffToModal'

/** Link cũ `/import/[formSlug]/review` (bước trong tab): chuyển sang modal `/import-form/[formSlug]/review`. */
export default function LegacyImportReviewStepRoute() {
  const { formSlug } = useLocalSearchParams<{ formSlug: string }>()
  const handOff = useHandOffToModal()
  useEffect(() => {
    handOff({ pathname: '/import-form/[formSlug]/review', params: { formSlug } })
  }, [handOff, formSlug])
  return null
}
