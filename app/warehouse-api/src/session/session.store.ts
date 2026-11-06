import { EntityManager, Equal, IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { RefreshTokenFamily, RefreshTokenHash } from './refresh-token.entity';
import { SessionRevokeReason } from './session.constants';
import { AuthSession } from './session.entity';
import { SessionException } from './session.exception';
import { hashRefreshToken } from './session.policy';
import { SessionValidation } from './session.validation';

/** Danh tính đã xác thực của 1 RPC: CHỈ lấy từ JWT đã kiểm + phiên trong DB, không từ body/metadata. */
export interface SessionPrincipal {
  userId: string;
  sessionId: string;
}

/** Khoá ghi (`SELECT … FOR UPDATE`) cho đọc-rồi-ghi trạng thái phiên (BE-TX-02). */
export const LOCK = { mode: 'pessimistic_write' } as const;

/**
 * Thao tác ghi bảng phiên dùng chung trong transaction của `SessionService` (mọi hàm nhận `manager` của
 * transaction đang mở, không tự mở transaction).
 */
export async function insertCurrentHash(
  manager: EntityManager,
  familyId: string,
  token: string,
  now: Date,
  expiresAt: Date,
): Promise<void> {
  await manager.insert(RefreshTokenHash, {
    id: uuidv4(),
    familyId,
    tokenHash: hashRefreshToken(token),
    currentFamilyId: familyId,
    createdAt: now,
    expiresAt,
    usedAt: null,
  });
}

export async function lockOwnSession(
  manager: EntityManager,
  principal: SessionPrincipal,
  sessionId: string,
  hideOthers = false,
): Promise<AuthSession> {
  const session = await manager.findOne(AuthSession, {
    where: { id: Equal(sessionId), userId: Equal(principal.userId) },
    lock: LOCK,
  });
  if (session) return session;
  // Phiên của chính caller biến mất giữa xác thực và transaction (xoá cứng) ⇒ 401; phiên khác ⇒ 404.
  throw new SessionException(
    hideOthers ? SessionValidation.SESSION_NOT_FOUND : SessionValidation.SESSION_REVOKED,
  );
}

/**
 * Khoá phiên hiện tại + mọi phiên chưa thu hồi của user theo thứ tự id tăng dần (1 câu `FOR UPDATE`), để 2
 * logout-all/đổi mật khẩu song song từ 2 phiên khác nhau không khoá chéo (deadlock).
 */
export async function lockUserSessions(
  manager: EntityManager,
  principal: SessionPrincipal,
): Promise<{ current: AuthSession; sessions: AuthSession[] }> {
  const userId = Equal(principal.userId);
  const sessions = await manager.find(AuthSession, {
    where: [
      { userId, revokedAt: IsNull() },
      { userId, id: Equal(principal.sessionId) },
    ],
    order: { id: 'ASC' },
    lock: LOCK,
  });
  const current = sessions.find((session) => session.id === principal.sessionId);
  if (!current) throw new SessionException(SessionValidation.SESSION_REVOKED);
  return { current, sessions };
}

/** Thu hồi phiên + family của nó (cùng transaction). `session` phải là bản đã khoá. */
export async function revokeSession(
  manager: EntityManager,
  session: AuthSession,
  reason: SessionRevokeReason,
  now: Date,
): Promise<void> {
  session.revokedAt = now;
  session.revokeReason = reason;
  session.version += 1;
  await manager.update(
    AuthSession,
    { id: Equal(session.id) },
    { revokedAt: now, revokeReason: reason, version: session.version },
  );
  await manager.update(
    RefreshTokenFamily,
    { sessionId: Equal(session.id), revokedAt: IsNull() },
    { revokedAt: now, revokeReason: reason },
  );
}
