import { useEffect } from 'react'
import { readSharedActivityAt, writeSharedActivityAt } from '@/shared/api/v1'
import { useAppDispatch, useAppSelector } from '@/shared/store'
import { recordActivityV1 } from '../../api/session-v1.api'
import { startActivityTracker } from './activity-tracker'
import { selectSessionV1, type V1SessionState } from './session-v1.slice'
import { endV1Session } from './session-v1.thunks'

export function useSessionV1(): V1SessionState {
  return useAppSelector(selectSessionV1)
}

/**
 * Gắn theo dõi tương tác khi phiên v1 đang `authenticated`; dừng ngay khi khoá/đăng xuất. Hết
 * hạn idle cục bộ → khoá (`idle`) mà không gọi API.
 */
export function useSessionActivityV1(): void {
  const status = useAppSelector((state) => selectSessionV1(state).status)
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (status !== 'authenticated') return
    return startActivityTracker({
      report: recordActivityV1,
      onIdle: () => dispatch(endV1Session('idle')),
      shared: { read: readSharedActivityAt, write: writeSharedActivityAt },
    })
  }, [status, dispatch])
}
