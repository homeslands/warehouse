import { deleteData, getData, patchData } from '@/shared/api/http'
import type { AuthSession, Profile, UpdateProfileInput } from '../model/types'

export const fetchProfile = (): Promise<Profile> => getData<Profile>('/auth/me')

/** Chưa có ở backend — chỉ gọi khi `BACKEND_SUPPORTS.profileEdit`. */
export const updateProfile = (input: UpdateProfileInput): Promise<Profile> =>
  patchData<Profile>('/auth/me', input)

/** Chưa có ở backend — chỉ gọi khi `BACKEND_SUPPORTS.sessionList`. */
export const fetchAuthSessions = (): Promise<AuthSession[]> =>
  getData<AuthSession[]>('/auth/sessions')

/** Chưa có ở backend — chỉ gọi khi `BACKEND_SUPPORTS.sessionList`. */
export const revokeAuthSession = (sessionId: string): Promise<string> =>
  deleteData<string>(`/auth/sessions/${sessionId}`)
