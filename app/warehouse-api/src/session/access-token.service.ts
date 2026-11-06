import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_SECRET_MIN_LENGTH,
  ACCESS_TOKEN_TTL_SECONDS,
  ACCESS_TOKEN_TYPE,
} from './session.constants';
import { SessionException } from './session.exception';
import { Clock } from './session.policy';
import { SessionErrorCodeValue, SessionValidation } from './session.validation';

/** Claim của access JWT v1. `sid` = id phiên trong `auth_session_tbl`. */
export interface AccessTokenClaims {
  sub: string;
  sid: string;
}

interface AccessTokenPayload extends AccessTokenClaims {
  typ: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

const MS_PER_SECOND = 1_000;
const toEpochSeconds = (date: Date) => Math.floor(date.getTime() / MS_PER_SECOND);

/**
 * Ký/kiểm access JWT v1 (15 phút, business-rules §20). Tách hẳn khỏi token legacy:
 * - secret riêng (`V1_ACCESS_TOKEN_SECRET`), nên token legacy không qua được Storage và token v1 không
 *   qua được `JwtStrategy` legacy (khác secret);
 * - `iss`/`aud`/`typ` cố định, thuật toán khoá HS256 (chặn `alg: none`/đổi thuật toán).
 * Thời điểm lấy từ `Clock` inject (iat/exp ký tường minh, verify bằng `clockTimestamp`).
 */
export class AccessTokenService {
  private readonly jwt: JwtService;

  constructor(
    secret: string,
    private readonly clock: Clock,
  ) {
    if (typeof secret !== 'string' || secret.length < ACCESS_TOKEN_SECRET_MIN_LENGTH)
      throw new RangeError(
        `access token secret must be at least ${ACCESS_TOKEN_SECRET_MIN_LENGTH} characters`,
      );
    this.jwt = new JwtService({ secret });
  }

  sign(claims: AccessTokenClaims): IssuedAccessToken {
    const iat = toEpochSeconds(this.clock.now());
    const exp = iat + ACCESS_TOKEN_TTL_SECONDS;
    const payload: AccessTokenPayload = {
      sub: claims.sub,
      sid: claims.sid,
      typ: ACCESS_TOKEN_TYPE,
      jti: uuidv4(),
      iat,
      exp,
    };
    const token = this.jwt.sign(payload, {
      algorithm: ACCESS_TOKEN_ALGORITHM,
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
    });
    return { token, expiresAt: new Date(exp * MS_PER_SECOND) };
  }

  /** Kiểm chữ ký/iss/aud/exp/typ và dạng claim. Sai bất kỳ ⇒ `SessionException` 401 (không lộ lý do chi tiết). */
  verify(token: string): AccessTokenClaims {
    let payload: Partial<AccessTokenPayload>;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(token, {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
        clockTimestamp: toEpochSeconds(this.clock.now()),
      });
    } catch (error) {
      // Map lỗi dự kiến của jsonwebtoken: hết hạn ⇒ mã riêng (FE refresh), còn lại ⇒ token không hợp lệ.
      throw new SessionException(verificationError(error));
    }
    if (
      payload.typ !== ACCESS_TOKEN_TYPE ||
      !uuidValidate(payload.sub ?? '') ||
      !uuidValidate(payload.sid ?? '')
    )
      throw new SessionException(SessionValidation.SESSION_ACCESS_TOKEN_INVALID);
    return { sub: payload.sub as string, sid: payload.sid as string };
  }
}

/** Lỗi verify dự kiến của jsonwebtoken; lỗi khác (bug/cấu hình) ném lại nguyên vẹn ⇒ INTERNAL. */
const JWT_VERIFY_ERRORS = new Set(['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError']);

function verificationError(error: unknown): SessionErrorCodeValue {
  if (!(error instanceof Error) || !JWT_VERIFY_ERRORS.has(error.name)) throw error;
  return error.name === 'TokenExpiredError'
    ? SessionValidation.SESSION_ACCESS_TOKEN_EXPIRED
    : SessionValidation.SESSION_ACCESS_TOKEN_INVALID;
}
