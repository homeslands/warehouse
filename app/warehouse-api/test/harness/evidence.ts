import { mkdirSync, writeFileSync } from 'fs';
import { isAbsolute, join } from 'path';

const SECRET_KEYS = /pass(word)?|secret|token|credential|private/i;

/**
 * Ghi record JSON vào `WH_E2E_EVIDENCE_DIR` (tuỳ chọn, ngoài repo). Từ chối key có dạng secret để
 * evidence không bao giờ chứa password/token — chỉ ghi số đếm, status, tên migration, alias.
 */
export function writeEvidence(name: string, record: Record<string, unknown>): void {
  const dir = process.env.WH_E2E_EVIDENCE_DIR;
  if (!dir) return;
  if (!isAbsolute(dir)) throw new Error('WH_E2E_EVIDENCE_DIR must be absolute');
  const body = JSON.stringify(
    { ...record, recordedAt: new Date().toISOString() },
    (key, value) => {
      if (key && SECRET_KEYS.test(key)) throw new Error(`evidence key "${key}" looks secret`);
      return value;
    },
    2,
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), `${body}\n`, { mode: 0o644 });
}
