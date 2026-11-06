import { readFileSync } from 'fs';
import {
  ChannelCredentials,
  credentials,
  ServerCredentials,
  ServerInterceptingCallInterface,
} from '@grpc/grpc-js';

/** grpc-js không export `AuthContext` ở entry chính; lấy từ chữ ký `getAuthContext()`. */
export type GrpcAuthContext = ReturnType<ServerInterceptingCallInterface['getAuthContext']>;

/**
 * Vật liệu mTLS (architecture R2 "Đường tin cậy" bước 3): Gateway và Storage xác thực nhau bằng cert
 * do cùng một CA cấp. Mỗi phía có cert + private key riêng và tin CA chung.
 * Không log/in nội dung key; lỗi chỉ nêu nhãn file.
 */
export interface MtlsMaterial {
  /** PEM CA dùng để kiểm cert phía bên kia. */
  ca: Buffer;
  /** PEM cert của chính service này. */
  cert: Buffer;
  /** PEM private key của chính service này. */
  key: Buffer;
}

export interface MtlsFilePaths {
  caPath: string;
  certPath: string;
  keyPath: string;
}

export class MtlsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MtlsConfigError';
  }
}

const PEM_CERTIFICATE = '-----BEGIN CERTIFICATE-----';
const PEM_PRIVATE_KEY = /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/;

function readPem(label: string, path: string, isValid: (pem: string) => boolean): Buffer {
  if (!path) throw new MtlsConfigError(`mTLS ${label} path is not configured`);
  let content: Buffer;
  try {
    content = readFileSync(path);
  } catch {
    // Map lỗi I/O sang lỗi cấu hình có nhãn; không kèm nội dung file hay stack của fs.
    throw new MtlsConfigError(`mTLS ${label} file cannot be read`);
  }
  if (!isValid(content.toString('utf8'))) throw new MtlsConfigError(`mTLS ${label} is not PEM`);
  return content;
}

export function loadMtlsMaterial(paths: MtlsFilePaths): MtlsMaterial {
  return {
    ca: readPem('CA', paths.caPath, (pem) => pem.includes(PEM_CERTIFICATE)),
    cert: readPem('certificate', paths.certPath, (pem) => pem.includes(PEM_CERTIFICATE)),
    key: readPem('private key', paths.keyPath, (pem) => PEM_PRIVATE_KEY.test(pem)),
  };
}

/**
 * Credentials server Storage: bắt buộc client trình cert do `ca` cấp (`checkClientCertificate`).
 * Client không cert hoặc cert từ CA khác bị từ chối ngay ở TLS handshake.
 */
export function createStorageServerCredentials(material: MtlsMaterial): ServerCredentials {
  return ServerCredentials.createSsl(
    material.ca,
    [{ cert_chain: material.cert, private_key: material.key }],
    true,
  );
}

/** Credentials Gateway: trình cert Gateway và chỉ tin Storage có cert do `ca` cấp. */
export function createGatewayChannelCredentials(material: MtlsMaterial): ChannelCredentials {
  return credentials.createSsl(material.ca, material.key, material.cert);
}

/**
 * Identity của peer trong mTLS = Common Name của cert client đã được CA chung xác minh.
 * `undefined` khi kết nối không phải TLS hoặc peer không trình cert.
 */
export function peerIdentity(authContext: GrpcAuthContext | undefined): string | undefined {
  if (authContext?.transportSecurityType !== 'ssl') return undefined;
  const commonName: unknown = authContext.sslPeerCertificate?.subject?.CN;
  return typeof commonName === 'string' && commonName.length > 0 ? commonName : undefined;
}
