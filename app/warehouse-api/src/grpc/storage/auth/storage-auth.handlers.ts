import {
  Metadata,
  sendUnaryData,
  ServerUnaryCall,
  UntypedHandleCall,
  UntypedServiceImplementation,
} from '@grpc/grpc-js';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { AuthSession } from 'src/session/session.entity';
import { SessionException } from 'src/session/session.exception';
import { Clock, ClientInfo, maskIp } from 'src/session/session.policy';
import {
  parseLoginInput,
  parsePasswordChangeInput,
  parseSessionId,
  parseSessionListQuery,
} from 'src/session/session.request';
import {
  AuthenticationMode,
  IssuedSession,
  SessionActionOutcome,
  SessionPage,
  SessionPrincipal,
  SessionService,
} from 'src/session/session.service';
import {
  CLIENT_IP_METADATA_KEY,
  CLIENT_USER_AGENT_METADATA_KEY,
  REFRESH_TOKEN_METADATA_KEY,
} from '../../grpc.constants';
import {
  readStorageCallContext,
  StorageCallContext,
  storageRpcFailure,
} from '../storage-grpc.server';

type RawRequest = Record<string, unknown>;

interface HandlerResult {
  result: object;
  /** Chỉ Login/Refresh: gửi về Gateway trong response header metadata, không nằm trong message. */
  refreshToken?: string;
}

export interface StorageAuthHandlerDependencies {
  sessions: SessionService;
  clock: Clock;
  /** Log lỗi không lường trước (chỉ tên RPC/traceId/tên lỗi — không message/metadata). */
  logError(message: string): void;
}

/** 9 RPC phiên làm ở I-02a. `GetProfile`/`UpdateProfile` để I-02b (cần mapping `User` v1 của I-03). */
export const STORAGE_AUTH_RPCS = [
  'Login',
  'Refresh',
  'Logout',
  'Logoutall',
  'Lock',
  'ChangeOwnPassword',
  'RecordInteractiveActivity',
  'ListOwnSessions',
  'RevokeOwnSession',
] as const;

function singleMetadataString(metadata: Metadata, key: string): string | undefined {
  const values = metadata.get(key);
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : undefined;
}

function readClientInfo(metadata: Metadata): ClientInfo {
  return {
    ip: singleMetadataString(metadata, CLIENT_IP_METADATA_KEY),
    userAgent: singleMetadataString(metadata, CLIENT_USER_AGENT_METADATA_KEY),
  };
}

/**
 * `LoginResult` (proto). `expiresIn` (OpenAPI const 900, proto lại khai `Struct`) và `csrfToken` (gắn với
 * cookie, Gateway sinh — DEV-197-08) do Gateway điền. `user` mới có id/phoneNumber/isActive: mapping đủ
 * `User` v1 (displayName, email, role family/builtIn/version, warehouseIds, version) chờ I-03/DEV-196-02.
 */
function loginResult(issued: IssuedSession): object {
  return {
    accessToken: issued.accessToken.token,
    sessionId: issued.session.id,
    user: {
      id: issued.user.id,
      phoneNumber: issued.user.phonenumber,
      isActive: issued.user.isActive,
    },
  };
}

function actionResult(outcome: SessionActionOutcome, traceId: string): object {
  return { id: outcome.id, version: String(outcome.version), status: outcome.status, traceId };
}

function sessionView(session: AuthSession, currentSessionId: string): object {
  const view: Record<string, unknown> = {
    id: session.id,
    isCurrent: session.id === currentSessionId,
    createdAt: session.createdAt.toISOString(),
    lastInteractiveAt: session.lastInteractiveAt.toISOString(),
    idleExpiresAt: session.idleExpiresAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
  const ipMasked = maskIp(session.ipAddress);
  if (ipMasked) view.ipMasked = ipMasked;
  if (session.userAgent) view.userAgent = session.userAgent;
  return view;
}

type RpcRun = (
  request: RawRequest,
  context: StorageCallContext,
  metadata: Metadata,
) => Promise<HandlerResult>;
type AuthenticatedRun = (
  request: RawRequest,
  principal: SessionPrincipal,
  context: StorageCallContext,
) => Promise<object>;

/** Bọc 1 RPC unary: đọc context, chạy, gửi refresh token (nếu có) trong header metadata, map lỗi. */
function unaryHandler(
  deps: StorageAuthHandlerDependencies,
  rpc: string,
  run: RpcRun,
): UntypedHandleCall {
  return (call: ServerUnaryCall<RawRequest, object>, callback: sendUnaryData<object>) => {
    const context = readStorageCallContext(call);
    run(call.request ?? {}, context, call.metadata).then(
      ({ result, refreshToken }) => {
        if (refreshToken !== undefined) {
          const headers = new Metadata();
          headers.set(REFRESH_TOKEN_METADATA_KEY, refreshToken);
          call.sendMetadata(headers);
        }
        callback(null, {
          result,
          meta: { traceId: context.traceId, timestamp: deps.clock.now().toISOString() },
        });
      },
      (error: unknown) => callback(toFailure(rpc, context, error, deps)),
    );
  };
}

/** RPC cần đăng nhập: Storage tự xác thực JWT + phiên trước khi chạy nghiệp vụ. */
function authenticated(
  sessions: SessionService,
  mode: AuthenticationMode,
  run: AuthenticatedRun,
): RpcRun {
  return async (request, context) => {
    const principal = await sessions.authenticate(context.authorization, mode);
    return { result: await run(request, principal, context) };
  };
}

function issued(session: IssuedSession): HandlerResult {
  return { result: loginResult(session), refreshToken: session.refreshToken };
}

function sessionPage(page: SessionPage, currentSessionId: string): object {
  const totalPages = Math.ceil(page.total / page.pageSize);
  return {
    page: String(page.page),
    pageSize: String(page.pageSize),
    total: String(page.total),
    totalPages: String(totalPages),
    hasNext: page.page < totalPages,
    hasPrevious: page.page > 1,
    items: page.items.map((session) => sessionView(session, currentSessionId)),
  };
}

/** Phiên đang có: thu hồi được lặp lại (`revocation`) hoặc phải còn dùng được (`strict`). */
function sessionActionRuns(sessions: SessionService): Record<string, RpcRun> {
  const action = (
    mode: AuthenticationMode,
    run: (p: SessionPrincipal, r: RawRequest) => Promise<SessionActionOutcome>,
  ) =>
    authenticated(sessions, mode, async (request, principal, context) =>
      actionResult(await run(principal, request), context.traceId),
    );
  return {
    Logout: action('revocation', (principal) => sessions.logout(principal)),
    // Review I-02a M1: logout-all và lock cần phiên còn dùng được; chỉ logout (chạm đúng phiên đó) lặp được.
    Logoutall: action('strict', (principal) => sessions.logoutAll(principal)),
    Lock: action('strict', (principal) => sessions.lock(principal)),
    ChangeOwnPassword: action('strict', (principal, request) =>
      sessions.changeOwnPassword(principal, parsePasswordChangeInput(request.data)),
    ),
    RecordInteractiveActivity: action('strict', (principal) => sessions.recordActivity(principal)),
    RevokeOwnSession: action('strict', (principal, request) =>
      sessions.revokeOwnSession(principal, parseSessionId(request.id)),
    ),
    ListOwnSessions: authenticated(sessions, 'strict', async (request, principal) =>
      sessionPage(
        await sessions.listOwnSessions(principal, parseSessionListQuery(request)),
        principal.sessionId,
      ),
    ),
  };
}

/**
 * Handler Storage cho các RPC phiên (W02 I-02a). Mỗi RPC cần đăng nhập đều tự kiểm JWT trong metadata
 * `authorization` qua `SessionService.authenticate` — không đọc identity từ body (proto không có field đó;
 * field lạ bị bỏ khi decode). Lỗi:
 * - `SessionException` ⇒ gRPC status + detail `warehouse-error-bin` đã validate (Gateway dịch sang envelope v1);
 * - lỗi khác ⇒ INTERNAL không detail; chỉ log tên RPC/traceId/tên lỗi (message có thể chứa SQL/giá trị).
 */
export function createStorageAuthHandlers(
  deps: StorageAuthHandlerDependencies,
): UntypedServiceImplementation {
  const { sessions } = deps;
  const login: RpcRun = async (request, _context, metadata) =>
    issued(await sessions.login(parseLoginInput(request.data), readClientInfo(metadata)));
  const refresh: RpcRun = async (request) =>
    issued(await sessions.refresh(request.refreshCookieToken));
  const runs: Record<string, RpcRun> = {
    Login: login,
    Refresh: refresh,
    ...sessionActionRuns(sessions),
  };
  return Object.fromEntries(
    Object.entries(runs).map(([rpc, run]) => [rpc, unaryHandler(deps, rpc, run)]),
  );
}

function toFailure(
  rpc: string,
  context: StorageCallContext,
  error: unknown,
  deps: StorageAuthHandlerDependencies,
) {
  if (error instanceof SessionException) {
    const { error: value, fieldErrors } = error;
    return storageRpcFailure(value.grpcStatus, {
      statusCode: value.statusCode,
      code: value.code,
      errorKey: value.errorKey,
      message: value.message,
      errors: [...fieldErrors],
    });
  }
  const name = error instanceof Error ? error.name : typeof error;
  deps.logError(`Storage RPC ${rpc} failed (traceId=${context.traceId}): ${name}`);
  return storageRpcFailure(GrpcStatus.INTERNAL);
}
