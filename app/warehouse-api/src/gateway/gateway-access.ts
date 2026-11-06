import { Inject, Injectable } from '@nestjs/common';
import { AccessTokenService } from 'src/session/access-token.service';
import { SessionException } from 'src/session/session.exception';
import { Clock } from 'src/session/session.policy';
import { SessionValidation } from 'src/session/session.validation';
import { GatewayConfig } from './gateway.config';
import { GATEWAY_CLOCK, GATEWAY_CONFIG } from './gateway.constants';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

/**
 * Gateway kiểm access JWT (chữ ký/iss/aud/exp/typ) trước RPC — architecture "Đường tin cậy" bước 2. Sai ⇒ 401
 * cùng mã Storage dùng, RPC không được gửi. Storage vẫn tự kiểm lại + kiểm phiên trong DB (dùng chung secret
 * HS256 với Storage — Storage không tin Gateway: tự kiểm `sid` trong DB).
 * `Authorization` phải đúng `Bearer <jwt>` một dấu cách (follow-up I2: chặt hơn passport legacy).
 */
@Injectable()
export class GatewayAccessVerifier {
  private readonly tokens: AccessTokenService;

  constructor(@Inject(GATEWAY_CONFIG) config: GatewayConfig, @Inject(GATEWAY_CLOCK) clock: Clock) {
    this.tokens = new AccessTokenService(config.accessTokenSecret, clock);
  }

  /** Trả nguyên văn `Authorization` để chuyển tiếp sang Storage. */
  verify(authorization: string | undefined): string {
    if (!authorization) throw new SessionException(SessionValidation.SESSION_ACCESS_TOKEN_MISSING);
    const match = BEARER.exec(authorization);
    if (!match) throw new SessionException(SessionValidation.SESSION_ACCESS_TOKEN_INVALID);
    this.tokens.verify(match[1]);
    return authorization;
  }
}
