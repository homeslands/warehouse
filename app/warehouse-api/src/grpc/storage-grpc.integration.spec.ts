import {
  ChannelCredentials,
  credentials,
  Metadata,
  sendUnaryData,
  ServerUnaryCall,
  status as GrpcStatus,
} from '@grpc/grpc-js';
import {
  Controller,
  Get,
  Headers,
  INestApplication,
  Logger,
  Param,
  UseFilters,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import request from 'supertest';
import { validate as uuidValidate } from 'uuid';
import { v1Success } from 'src/shared/api-v1/envelope';
import { normalizeTraceId } from 'src/shared/api-v1/trace-id';
import { STORAGE_ERROR_DETAIL_METADATA_KEY } from 'src/shared/grpc/storage-error-detail';
import { TestCa, TestCertificate, TestPki } from '../../test/grpc/test-pki';
import { w02EnumAdapter } from './enum/w02-storage-enums';
import { StorageGrpcClient, StorageGrpcClientConfig } from './gateway/storage-grpc.client';
import { StorageGrpcClientModule } from './gateway/storage-grpc-client.module';
import { StorageRpcError } from './gateway/storage-rpc.error';
import { StorageRpcErrorFilter } from './gateway/storage-rpc-error.filter';
import { translateStorageRpcError } from './gateway/storage-rpc-error.translator';
import {
  GATEWAY_AUTHORIZATION_MALFORMED,
  STORAGE_CALLER_IDENTITY_REJECTED,
  StorageRpcSpecialValidation,
  StorageRpcValidation,
} from './gateway/storage-rpc.validation';
import { STORAGE_GRPC_CONFIG_KEYS, STORAGE_GRPC_MAX_DEADLINE_MS } from './grpc.constants';
import {
  readStorageCallContext,
  RunningStorageGrpcServer,
  StorageCallContext,
  startStorageGrpcServer,
  storageRpcFailure,
} from './storage/storage-grpc.server';

/**
 * Integration loopback THẬT (không mock grpc): server Storage + client Gateway bằng grpc-js qua mTLS trên
 * 127.0.0.1, cert sinh lúc chạy bằng openssl (test/grpc/test-pki.ts). Handler `GetJob` dưới đây là stub
 * CHỈ CỦA TEST để quan sát metadata/deadline/lỗi; server production không có handler nghiệp vụ nào.
 */
jest.setTimeout(60_000);

const STORAGE_NAME = 'warehouse-storage';
const GATEWAY_NAME = 'warehouse-gateway';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl';
const JWT = `Bearer ${TOKEN}`;
/** Header không gửi được qua gRPC metadata (review I-01b M1). */
const MALFORMED_AUTHORIZATIONS: Array<[string, string]> = [
  ['TAB separator', `Bearer\t${TOKEN}`],
  ['CR/LF injection', `Bearer ${TOKEN}\r\nx-role: ADMIN`],
  ['latin1 character', `Bearer ${TOKEN}\u00e9`],
  ['non-latin1 character', `Bearer ${TOKEN}\u1e9e`],
  ['leading space', ` Bearer ${TOKEN}`],
  ['double space', `Bearer  ${TOKEN}`],
  ['empty value', ''],
];
const STANDARD_METADATA = new Set(['user-agent', 'content-type', 'te']);

interface GetJobRequest {
  id?: string;
  [key: string]: unknown;
}
interface GetJobResponse {
  result: { id: string; kind: string; status: string; createdAt: string; progress: string };
  meta: { traceId: string; timestamp: string };
}
interface ReceivedCall {
  request: GetJobRequest;
  context: StorageCallContext;
  customMetadataKeys: string[];
  cancelled: boolean;
}

const SLOW_HANDLER_MS = 1_000;
const POLL_MS = 20;

async function waitFor(condition: () => boolean, timeoutMs = 1_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!condition() && Date.now() < until)
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

function failureFor(id: string) {
  switch (id) {
    case 'conflict':
      return storageRpcFailure(GrpcStatus.FAILED_PRECONDITION, {
        statusCode: 409,
        code: 100_001,
        errorKey: 'JOB_VERSION_CONFLICT',
        message: 'Version conflict',
        errors: [],
      });
    case 'invalid':
      return storageRpcFailure(GrpcStatus.INVALID_ARGUMENT, {
        code: 100_002,
        errorKey: 'JOB_ID_INVALID',
        message: 'Invalid id',
        errors: [{ field: 'id', errorKey: 'JOB_ID_INVALID', message: 'id must be a UUID' }],
      });
    case 'bad-detail': {
      const failure = storageRpcFailure(GrpcStatus.FAILED_PRECONDITION);
      failure.metadata.set(STORAGE_ERROR_DETAIL_METADATA_KEY, Buffer.from('{"code":"x"'));
      return failure;
    }
    case 'internal':
      return storageRpcFailure(
        GrpcStatus.INTERNAL,
        undefined,
        'Error: password=hunter2 at /srv/storage/secret.ts:42',
      );
    case 'unavailable':
      return storageRpcFailure(GrpcStatus.UNAVAILABLE, undefined, 'mysql connect ECONNREFUSED');
    default:
      return undefined;
  }
}

describe('Storage gRPC runtime over mTLS (loopback, real grpc-js)', () => {
  const pki = new TestPki();
  const received: ReceivedCall[] = [];
  let ca: TestCa;
  let rogueCa: TestCa;
  let gatewayCert: TestCertificate;
  let storage: RunningStorageGrpcServer;
  let address: string;
  const clients: StorageGrpcClient[] = [];

  const getJob = (
    call: ServerUnaryCall<GetJobRequest, GetJobResponse>,
    callback: sendUnaryData<GetJobResponse>,
  ) => {
    const entry: ReceivedCall = {
      request: call.request,
      context: readStorageCallContext(call),
      customMetadataKeys: Object.keys(call.metadata.getMap())
        .filter((key) => !key.startsWith('grpc-') && !STANDARD_METADATA.has(key))
        .sort(),
      cancelled: false,
    };
    received.push(entry);
    call.on('cancelled', () => (entry.cancelled = true));
    const failure = failureFor(call.request.id);
    if (failure) return callback(failure);
    const reply = () =>
      callback(null, {
        result: {
          id: call.request.id,
          kind: 'TEST_ONLY',
          status: 'STATUS_QUEUED',
          createdAt: '2026-11-06T00:00:00Z',
          progress: '0',
        },
        meta: { traceId: entry.context.traceId, timestamp: '2026-11-06T00:00:00Z' },
      });
    if (call.request.id === 'slow') setTimeout(reply, SLOW_HANDLER_MS);
    else reply();
  };

  const clientConfig = (
    cert: TestCertificate,
    overrides: Partial<StorageGrpcClientConfig> = {},
  ) => ({
    address,
    serverName: STORAGE_NAME,
    tls: { ca: ca.cert, cert: cert.cert, key: cert.key },
    deadlineMs: 2_000,
    ...overrides,
  });
  const newClient = (cert: TestCertificate, channel?: ChannelCredentials, overrides = {}) => {
    const client = new StorageGrpcClient(clientConfig(cert, overrides), channel);
    clients.push(client);
    return client;
  };
  const callGetJob = (client: StorageGrpcClient, id: string, deadlineMs?: number) =>
    client.unary<GetJobResponse>(
      'GetJob',
      { id },
      { traceId: normalizeTraceId(undefined), authorization: JWT, deadlineMs },
    );
  const grpcCodeOf = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(StorageRpcError);
    return (error as StorageRpcError).grpcCode;
  };

  beforeAll(async () => {
    ca = pki.createCa('wh-test-ca');
    rogueCa = pki.createCa('wh-rogue-ca');
    gatewayCert = pki.issue(ca, 'gateway', GATEWAY_NAME, 'clientAuth');
    const storageCert = pki.issue(ca, 'storage', STORAGE_NAME, 'serverAuth');
    storage = await startStorageGrpcServer(
      {
        bindAddress: '127.0.0.1:0',
        tls: { ca: ca.cert, cert: storageCert.cert, key: storageCert.key },
        allowedCallerIdentities: [GATEWAY_NAME],
      },
      { GetJob: getJob },
    );
    address = `127.0.0.1:${storage.port}`;
  });

  afterAll(async () => {
    clients.forEach((client) => client.close());
    await storage?.shutdown();
    pki.cleanup();
  });

  beforeEach(() => {
    received.length = 0;
  });

  describe('mTLS caller identity (TC-ARC-01 transport part)', () => {
    it('accepts the Gateway certificate issued by the shared CA', async () => {
      const response = await callGetJob(newClient(gatewayCert), 'echo');
      expect(response.result.id).toBe('echo');
      expect(received).toHaveLength(1);
    });

    it('rejects a client without certificate at the TLS handshake; handler never runs', async () => {
      const noCert = newClient(gatewayCert, credentials.createSsl(ca.cert));
      expect(await grpcCodeOf(callGetJob(noCert, 'echo'))).toBe(GrpcStatus.UNAVAILABLE);
      expect(received).toHaveLength(0);
    });

    it('rejects a client certificate from another CA; handler never runs', async () => {
      const rogue = pki.issue(rogueCa, 'rogue-gateway', GATEWAY_NAME, 'clientAuth');
      expect(await grpcCodeOf(callGetJob(newClient(rogue), 'echo'))).toBe(GrpcStatus.UNAVAILABLE);
      expect(received).toHaveLength(0);
    });

    it('rejects a plaintext client; handler never runs', async () => {
      const plain = newClient(gatewayCert, credentials.createInsecure());
      expect(await grpcCodeOf(callGetJob(plain, 'echo'))).toBe(GrpcStatus.UNAVAILABLE);
      expect(received).toHaveLength(0);
    });

    const identityRejection = async (cert: TestCertificate, expected: GrpcStatus) => {
      const error = await callGetJob(newClient(cert), 'echo').catch(
        (reason: StorageRpcError) => reason,
      );
      expect(error).toBeInstanceOf(StorageRpcError);
      expect((error as StorageRpcError).grpcCode).toBe(expected);
      expect(received).toHaveLength(0);
      return translateStorageRpcError(error as StorageRpcError);
    };

    it('returns PERMISSION_DENIED for a CA-issued certificate whose CN is not allowlisted → 503 (not 403)', async () => {
      const other = pki.issue(ca, 'ui', 'warehouse-ui', 'clientAuth');
      const { statusCode, body, special } = await identityRejection(
        other,
        GrpcStatus.PERMISSION_DENIED,
      );
      expect(special).toBe(STORAGE_CALLER_IDENTITY_REJECTED);
      expect(statusCode).toBe(503);
      expect(body).toMatchObject({
        code: StorageRpcSpecialValidation.STORAGE_CALLER_IDENTITY_REJECTED.code,
        errorKey: 'STORAGE_CALLER_IDENTITY_REJECTED',
        message: 'Service temporarily unavailable',
      });
    });

    it('returns UNAUTHENTICATED for a CA-issued certificate without CN (SAN only) → 503 (not 401)', async () => {
      const sanOnly = pki.issue(ca, 'san-only', null, 'clientAuth', GATEWAY_NAME);
      const { statusCode, special } = await identityRejection(sanOnly, GrpcStatus.UNAUTHENTICATED);
      expect(special).toBe(STORAGE_CALLER_IDENTITY_REJECTED);
      expect(statusCode).toBe(503);
    });

    it('refuses to talk to a Storage whose certificate is not from the shared CA', async () => {
      const rogueStorageCert = pki.issue(rogueCa, 'rogue-storage', STORAGE_NAME, 'serverAuth');
      const rogueStorage = await startStorageGrpcServer(
        {
          bindAddress: '127.0.0.1:0',
          tls: { ca: ca.cert, cert: rogueStorageCert.cert, key: rogueStorageCert.key },
          allowedCallerIdentities: [GATEWAY_NAME],
        },
        { GetJob: getJob },
      );
      try {
        const client = newClient(gatewayCert, undefined, {
          address: `127.0.0.1:${rogueStorage.port}`,
        });
        expect(await grpcCodeOf(callGetJob(client, 'echo'))).toBe(GrpcStatus.UNAVAILABLE);
        expect(received).toHaveLength(0);
      } finally {
        await rogueStorage.shutdown();
      }
    });

    it('rejects a Storage certificate whose name does not match serverName', async () => {
      const client = newClient(gatewayCert, undefined, { serverName: 'other-service' });
      expect(await grpcCodeOf(callGetJob(client, 'echo'))).toBe(GrpcStatus.UNAVAILABLE);
      expect(received).toHaveLength(0);
    });
  });

  describe('metadata propagation', () => {
    it('forwards the original JWT and the traceId, and nothing else as custom metadata', async () => {
      const traceId = normalizeTraceId(undefined);
      await newClient(gatewayCert).unary('GetJob', { id: 'echo' }, { traceId, authorization: JWT });
      expect(received[0].context.authorization).toBe(JWT);
      expect(received[0].context.traceId).toBe(traceId);
      expect(received[0].customMetadataKeys).toEqual(['authorization', 'x-trace-id']);
    });

    it('does not carry identity claims from the request body (unknown fields are not on the wire)', async () => {
      const traceId = normalizeTraceId(undefined);
      await newClient(gatewayCert).unary(
        'GetJob',
        { id: 'echo', role: 'ADMIN', userId: 'u-admin', warehouseId: 'B' },
        { traceId, authorization: JWT },
      );
      expect(received[0].request).toEqual({ id: 'echo' });
      expect(received[0].customMetadataKeys).toEqual(['authorization', 'x-trace-id']);
    });

    it('omits authorization when the caller has no JWT (login/refresh)', async () => {
      const traceId = normalizeTraceId(undefined);
      await newClient(gatewayCert).unary('GetJob', { id: 'echo' }, { traceId });
      expect(received[0].context.authorization).toBeUndefined();
      expect(received[0].customMetadataKeys).toEqual(['x-trace-id']);
    });

    it.each(MALFORMED_AUTHORIZATIONS)(
      'rejects an Authorization with %s before sending; 401 without leaking the token',
      async (_label, authorization) => {
        const traceId = normalizeTraceId(undefined);
        const error = await newClient(gatewayCert)
          .unary('GetJob', { id: 'echo' }, { traceId, authorization })
          .catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(StorageRpcError);
        expect((error as StorageRpcError).gatewayReason).toBe(GATEWAY_AUTHORIZATION_MALFORMED);
        expect((error as StorageRpcError).message).not.toContain(TOKEN);
        expect(received).toHaveLength(0);
        const { statusCode, body } = translateStorageRpcError(error as StorageRpcError);
        expect(statusCode).toBe(401);
        expect(body).toMatchObject({ errorKey: 'GATEWAY_AUTHORIZATION_MALFORMED', traceId });
        expect(JSON.stringify(body)).not.toContain(TOKEN);
      },
    );

    it.each(MALFORMED_AUTHORIZATIONS)(
      'buildMetadata refuses an Authorization with %s with a message that has no value',
      (_label, authorization) => {
        const traceId = normalizeTraceId(undefined);
        expect(() => StorageGrpcClient.buildMetadata({ traceId, authorization })).toThrow(
          new RangeError('authorization header is malformed'),
        );
      },
    );

    it('refuses to send a traceId that was not normalized to a UUID', () => {
      expect(() =>
        newClient(gatewayCert).unary('GetJob', { id: 'echo' }, { traceId: 'abc\r\nx: 1' }),
      ).toThrow(RangeError);
    });

    it('refuses unknown and streaming RPCs on the unary path', () => {
      const traceId = normalizeTraceId(undefined);
      const client = newClient(gatewayCert);
      expect(() => client.unary('DropDatabase', {}, { traceId })).toThrow(RangeError);
      expect(() => client.unary('UploadFile', {}, { traceId })).toThrow(RangeError);
    });
  });

  describe('deadline', () => {
    it.each([0, -1, 1.5, STORAGE_GRPC_MAX_DEADLINE_MS + 1, Number.MAX_SAFE_INTEGER])(
      'refuses a per-call deadline override of %p ms',
      (deadlineMs) => {
        const client = newClient(gatewayCert);
        expect(() =>
          client.unary(
            'GetJob',
            { id: 'echo' },
            { traceId: normalizeTraceId(undefined), deadlineMs },
          ),
        ).toThrow(RangeError);
      },
    );

    it.each([1, STORAGE_GRPC_MAX_DEADLINE_MS])(
      'accepts a configured deadline of %p ms',
      (deadlineMs) => {
        expect(() => newClient(gatewayCert, undefined, { deadlineMs })).not.toThrow();
      },
    );

    it.each([0, STORAGE_GRPC_MAX_DEADLINE_MS + 1])(
      'refuses a configured deadline of %p ms',
      (deadlineMs) => {
        expect(() => newClient(gatewayCert, undefined, { deadlineMs })).toThrow(RangeError);
      },
    );

    it('accepts the maximum deadline on a real call', async () => {
      const response = await callGetJob(
        newClient(gatewayCert),
        'echo',
        STORAGE_GRPC_MAX_DEADLINE_MS,
      );
      expect(response.result.id).toBe('echo');
    });

    it('propagates the configured deadline to Storage', async () => {
      const before = Date.now();
      await callGetJob(newClient(gatewayCert, undefined, { deadlineMs: 1_500 }), 'echo');
      const after = Date.now();
      const at = received[0].context.deadlineAt;
      // grpc-timeout làm tròn theo đơn vị; cho sai số nhỏ.
      expect(at).toBeGreaterThanOrEqual(before + 1_500 - 250);
      expect(at).toBeLessThanOrEqual(after + 1_500 + 250);
    });

    it('fails with DEADLINE_EXCEEDED → 504 and cancels the Storage call', async () => {
      const error = await callGetJob(newClient(gatewayCert), 'slow', 200).catch(
        (reason: StorageRpcError) => reason,
      );
      expect(error).toBeInstanceOf(StorageRpcError);
      const translated = translateStorageRpcError(error as StorageRpcError);
      expect(translated.statusCode).toBe(504);
      expect(translated.body).toMatchObject({
        code: StorageRpcValidation.STORAGE_RPC_DEADLINE_EXCEEDED.code,
        errorKey: 'STORAGE_RPC_DEADLINE_EXCEEDED',
      });
      // Sự kiện huỷ phía Storage đến sau khi client đã nhận lỗi; chờ tối đa 1 giây.
      await waitFor(() => received[0].cancelled);
      expect(received[0].cancelled).toBe(true);
    });
  });

  describe('error translation over the wire', () => {
    const translate = async (id: string) => {
      const error = await callGetJob(newClient(gatewayCert), id).catch(
        (reason: StorageRpcError) => reason,
      );
      expect(error).toBeInstanceOf(StorageRpcError);
      return translateStorageRpcError(error as StorageRpcError);
    };

    it('maps FAILED_PRECONDITION with a validated detail to 409 with code/errorKey', async () => {
      const { statusCode, body, fromDetail } = await translate('conflict');
      expect(statusCode).toBe(409);
      expect(fromDetail).toBe(true);
      expect(body).toMatchObject({
        statusCode: 409,
        code: 100_001,
        errorKey: 'JOB_VERSION_CONFLICT',
        message: 'Version conflict',
      });
      expect(body).not.toHaveProperty('errors');
    });

    it('maps INVALID_ARGUMENT to 422 with field errors', async () => {
      const { statusCode, body } = await translate('invalid');
      expect(statusCode).toBe(422);
      expect(body.errors).toEqual([
        { field: 'id', errorKey: 'JOB_ID_INVALID', message: 'id must be a UUID' },
      ]);
    });

    it('ignores a malformed detail and falls back to the status code mapping', async () => {
      const { statusCode, body, fromDetail } = await translate('bad-detail');
      expect(statusCode).toBe(409);
      expect(fromDetail).toBe(false);
      expect(body.errorKey).toBe('STORAGE_RPC_FAILED_PRECONDITION');
    });

    it('maps INTERNAL to 500 with a safe message (no gRPC details/stack/secret)', async () => {
      const { statusCode, body } = await translate('internal');
      expect(statusCode).toBe(500);
      expect(body.message).toBe('Internal error');
      expect(JSON.stringify(body)).not.toMatch(/hunter2|secret|\/srv/);
    });

    it('maps UNAVAILABLE from Storage to 503', async () => {
      const { statusCode, body } = await translate('unavailable');
      expect(statusCode).toBe(503);
      expect(body.errorKey).toBe('STORAGE_RPC_UNAVAILABLE');
      expect(body.message).not.toMatch(/mysql|ECONNREFUSED/);
    });

    it('maps an unreachable Storage to 503', async () => {
      const client = newClient(gatewayCert, undefined, { address: '127.0.0.1:1' });
      const error = await callGetJob(client, 'echo').catch((reason: StorageRpcError) => reason);
      expect(translateStorageRpcError(error as StorageRpcError).statusCode).toBe(503);
    });

    it('returns UNIMPLEMENTED for an RPC without handler → 500 (DEV-197-01)', async () => {
      const traceId = normalizeTraceId(undefined);
      const error = await newClient(gatewayCert)
        .unary('GetRole', { id: 'r1' }, { traceId, authorization: JWT })
        .catch((reason: StorageRpcError) => reason);
      expect((error as StorageRpcError).grpcCode).toBe(GrpcStatus.UNIMPLEMENTED);
      const { statusCode, body } = translateStorageRpcError(error as StorageRpcError);
      expect(statusCode).toBe(500);
      expect(body).toMatchObject({ errorKey: 'STORAGE_RPC_UNIMPLEMENTED', traceId });
    });
  });

  describe('HTTP → Gateway → gRPC → Storage (Nest app, supertest)', () => {
    @Controller('probe')
    @UseFilters(StorageRpcErrorFilter)
    class ProbeController {
      constructor(private readonly storageClient: StorageGrpcClient) {}

      @Get('jobs/:id')
      async getJob(@Param('id') id: string, @Headers('authorization') authorization?: string) {
        const traceId = normalizeTraceId(undefined);
        const response = await this.storageClient.unary<GetJobResponse>(
          'GetJob',
          { id },
          { traceId, authorization },
        );
        const status = w02EnumAdapter('Job.status').toApi(response.result.status);
        return v1Success({ id: response.result.id, status }, traceId, 'Retrieved');
      }
    }

    interface ProbeApp {
      app: INestApplication;
      warnings: string[];
      errors: string[];
    }

    /** App Nest chỉ cho test, Gateway dùng cert `cert` (để thử cả cert ngoài allowlist). */
    const createProbeApp = async (cert: TestCertificate): Promise<ProbeApp> => {
      const keys = STORAGE_GRPC_CONFIG_KEYS;
      const warnings: string[] = [];
      const errors: string[] = [];
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                [keys.address]: address,
                [keys.serverName]: STORAGE_NAME,
                [keys.caPath]: ca.certPath,
                [keys.certPath]: cert.certPath,
                [keys.keyPath]: cert.keyPath,
                [keys.deadlineMs]: '2000',
              }),
            ],
          }),
          StorageGrpcClientModule.forRoot(),
        ],
        controllers: [ProbeController],
        providers: [
          {
            provide: WINSTON_MODULE_NEST_PROVIDER,
            useValue: {
              log: jest.fn(),
              error: (m: string) => errors.push(m),
              warn: (m: string) => warnings.push(m),
            },
          },
        ],
      }).compile();
      const app = moduleRef.createNestApplication({ logger: false });
      await app.init();
      return { app, warnings, errors };
    };

    let probe: ProbeApp;
    /** Bắt log của exception handler mặc định của Nest (đường M1 cũ làm lộ JWT ở đây). */
    let nestLoggerError: jest.SpyInstance;

    beforeAll(async () => {
      probe = await createProbeApp(gatewayCert);
    });

    beforeEach(() => {
      probe.warnings.length = 0;
      probe.errors.length = 0;
      nestLoggerError = jest.spyOn(Logger.prototype, 'error');
    });

    afterEach(() => nestLoggerError.mockRestore());

    afterAll(async () => {
      await probe?.app.close();
    });

    const loggedText = () =>
      JSON.stringify([probe.warnings, probe.errors, nestLoggerError.mock.calls]);

    it('returns a v1 success envelope whose traceId is the one Storage received', async () => {
      const response = await request(probe.app.getHttpServer())
        .get('/probe/jobs/echo')
        .set('Authorization', JWT)
        .expect(200);
      expect(uuidValidate(response.body.traceId)).toBe(true);
      expect(response.body.traceId).toBe(received[0].context.traceId);
      expect(response.body.result).toEqual({ id: 'echo', status: 'QUEUED' });
      expect(received[0].context.authorization).toBe(JWT);
    });

    it('returns a v1 error envelope for a Storage business error', async () => {
      const response = await request(probe.app.getHttpServer())
        .get('/probe/jobs/conflict')
        .set('Authorization', JWT)
        .expect(409);
      expect(Object.keys(response.body).sort()).toEqual(
        ['code', 'errorKey', 'message', 'statusCode', 'timestamp', 'traceId'].sort(),
      );
      expect(response.body).toMatchObject({ statusCode: 409, errorKey: 'JOB_VERSION_CONFLICT' });
      expect(response.body.traceId).toBe(received[0].context.traceId);
    });

    it('returns 500 with a safe message and logs without secrets for INTERNAL', async () => {
      const response = await request(probe.app.getHttpServer())
        .get('/probe/jobs/internal')
        .set('Authorization', JWT)
        .expect(500);
      expect(response.body.message).toBe('Internal error');
      expect(JSON.stringify(response.body)).not.toMatch(/hunter2|secret/);
      expect(probe.warnings).toHaveLength(1);
      expect(probe.warnings[0]).toContain(`traceId=${response.body.traceId}`);
      expect(probe.warnings[0]).not.toMatch(/hunter2|secret|eyJ/);
    });

    // Node HTTP chỉ cho phép TAB và byte latin1 trong giá trị header (CR/LF bị chặn ở client test).
    it.each([
      ['TAB separator', `Bearer\t${TOKEN}`],
      ['latin1 character', `Bearer ${TOKEN}\u00e9`],
    ])(
      'returns 401 for an Authorization header with %s and never logs the token',
      async (_label, authorization) => {
        const response = await request(probe.app.getHttpServer())
          .get('/probe/jobs/echo')
          .set('Authorization', authorization)
          .expect(401);
        expect(response.body).toMatchObject({
          statusCode: 401,
          code: StorageRpcSpecialValidation.GATEWAY_AUTHORIZATION_MALFORMED.code,
          errorKey: 'GATEWAY_AUTHORIZATION_MALFORMED',
          message: 'Authentication required',
        });
        expect(JSON.stringify(response.body)).not.toContain(TOKEN);
        expect(received).toHaveLength(0);
        expect(nestLoggerError).not.toHaveBeenCalled();
        expect(loggedText()).not.toContain(TOKEN);
      },
    );

    it('returns 503 (not 403) and logs an error when Storage rejects the Gateway identity', async () => {
      const misconfigured = await createProbeApp(
        pki.issue(ca, 'gw-wrong', 'warehouse-ui', 'clientAuth'),
      );
      try {
        const response = await request(misconfigured.app.getHttpServer())
          .get('/probe/jobs/echo')
          .set('Authorization', JWT)
          .expect(503);
        expect(response.body).toMatchObject({
          errorKey: 'STORAGE_CALLER_IDENTITY_REJECTED',
          message: 'Service temporarily unavailable',
        });
        expect(received).toHaveLength(0);
        expect(misconfigured.errors).toHaveLength(1);
        expect(misconfigured.errors[0]).toContain('rejected the Gateway service identity');
        expect(misconfigured.errors[0]).toContain(`traceId=${response.body.traceId}`);
        expect(misconfigured.errors[0]).not.toContain(TOKEN);
      } finally {
        await misconfigured.app.close();
      }
    });
  });
});

describe('readStorageCallContext', () => {
  const call = (entries: Array<[string, string]>) => {
    const metadata = new Metadata();
    entries.forEach(([key, value]) => metadata.add(key, value));
    return { metadata, getDeadline: () => Infinity };
  };

  it('ignores a duplicated authorization value', () => {
    const context = readStorageCallContext(
      call([
        ['authorization', 'Bearer a'],
        ['authorization', 'Bearer b'],
      ]),
    );
    expect(context.authorization).toBeUndefined();
  });

  it('replaces a non-UUID traceId with a fresh UUID', () => {
    const context = readStorageCallContext(call([['x-trace-id', 'forged']]));
    expect(uuidValidate(context.traceId)).toBe(true);
  });

  it('ignores self-declared identity metadata', () => {
    const context = readStorageCallContext(
      call([
        ['x-user-id', 'admin'],
        ['x-role', 'ADMIN'],
      ]),
    );
    expect(Object.keys(context).sort()).toEqual(['deadlineAt', 'traceId']);
  });
});
