import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

/**
 * PKI CHỈ DÙNG CHO TEST: sinh CA + cert lá (EC P-256, hạn 1 ngày) bằng `openssl` vào thư mục tạm của
 * hệ điều hành, xoá khi `cleanup()`. Không commit key, không dùng ngoài test. Cần `openssl` trên PATH —
 * thiếu thì test lỗi rõ ràng (không skip).
 */
export interface TestCertificate {
  certPath: string;
  keyPath: string;
  cert: Buffer;
  key: Buffer;
}

export interface TestCa extends TestCertificate {
  name: string;
}

const DAYS = '1';

export class TestPki {
  readonly dir = mkdtempSync(join(tmpdir(), 'wh-grpc-pki-'));

  private openssl(args: string[]): void {
    execFileSync('openssl', args, { cwd: this.dir, stdio: 'pipe' });
  }

  private read(name: string): TestCertificate {
    const certPath = join(this.dir, `${name}.crt`);
    const keyPath = join(this.dir, `${name}.key`);
    return { certPath, keyPath, cert: readFileSync(certPath), key: readFileSync(keyPath) };
  }

  createCa(name: string): TestCa {
    // Tham số openssl xếp theo cặp cờ/giá trị cho dễ đọc.
    // prettier-ignore
    this.openssl([
      'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
      '-keyout', `${name}.key`, '-out', `${name}.crt`, '-days', DAYS, '-subj', `/CN=${name}`,
      '-addext', 'basicConstraints=critical,CA:TRUE',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
    ]);
    return { name, ...this.read(name) };
  }

  /** Cert lá do `ca` ký, CN + SAN DNS = `commonName`. */
  issue(ca: TestCa, name: string, commonName: string, usage: 'serverAuth' | 'clientAuth') {
    const extFile = join(this.dir, `${name}.ext`);
    writeFileSync(
      extFile,
      [
        'basicConstraints=CA:FALSE',
        'keyUsage=critical,digitalSignature',
        `extendedKeyUsage=${usage}`,
        `subjectAltName=DNS:${commonName}`,
      ].join('\n'),
    );
    // Tham số openssl xếp theo cặp cờ/giá trị cho dễ đọc.
    // prettier-ignore
    this.openssl([
      'req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
      '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${commonName}`,
    ]);
    // Tham số openssl xếp theo cặp cờ/giá trị cho dễ đọc.
    // prettier-ignore
    this.openssl([
      'x509', '-req', '-in', `${name}.csr`, '-CA', ca.certPath, '-CAkey', ca.keyPath,
      '-set_serial', `0x${randomBytes(8).toString('hex')}`, '-days', DAYS,
      '-extfile', extFile, '-out', `${name}.crt`,
    ]);
    return this.read(name);
  }

  cleanup(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
