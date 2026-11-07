import 'reflect-metadata';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

/**
 * Giữ tài liệu contract cho FE (`docs/contract/*.md`) khớp với route thật.
 * Mỗi route của controller phải có một tiêu đề `## <METHOD> /api/v1/<path>` trong docs,
 * và mỗi tiêu đề như vậy phải ứng với một route còn tồn tại.
 * Thêm, xoá hoặc đổi endpoint ⇒ sửa docs/contract trong cùng PR (xem docs/contract/README.md).
 */
const SRC_DIR = join(__dirname, '..');
const CONTRACT_DIR = join(__dirname, '../../docs/contract');
const GLOBAL_PREFIX = '/api/v1';

/** Module mẫu để scaffold module mới (skill new-feature), không dành cho FE. */
const EXCLUDED_CONTROLLER_DIRS = ['example'];

const HEADING =
  /^#{2,4}\s+`?(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|ALL)\s+(\/api\/v1[^\s`]*)`?\s*$/gm;

type Route = string;

const normalize = (method: string, path: string): Route => {
  const clean = `/${path}`.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return `${method} ${clean}`;
};

const asPaths = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [value === undefined ? '' : String(value)];

function findControllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findControllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

function routesOf(controller: new (...args: never[]) => unknown): Route[] {
  const routes: Route[] = [];
  const bases = asPaths(Reflect.getMetadata(PATH_METADATA, controller));
  const seen = new Set<string>();
  for (
    let proto = controller.prototype;
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || seen.has(name)) continue;
      seen.add(name);
      const handler = Object.getOwnPropertyDescriptor(proto, name)?.value as unknown;
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      for (const base of bases)
        for (const sub of asPaths(Reflect.getMetadata(PATH_METADATA, handler)))
          routes.push(normalize(RequestMethod[method], `${GLOBAL_PREFIX}/${base}/${sub}`));
    }
  }
  return routes;
}

async function collectRoutes(): Promise<Map<Route, string>> {
  const routes = new Map<Route, string>();
  const files = findControllerFiles(SRC_DIR).filter(
    (file) => !EXCLUDED_CONTROLLER_DIRS.includes(relative(SRC_DIR, file).split('/')[0]),
  );
  for (const file of files) {
    const exported = (await import(file)) as Record<string, unknown>;
    for (const value of Object.values(exported)) {
      if (typeof value !== 'function' || !Reflect.hasMetadata(PATH_METADATA, value)) continue;
      for (const route of routesOf(value as new (...args: never[]) => unknown))
        routes.set(route, relative(SRC_DIR, file));
    }
  }
  return routes;
}

function collectDocumented(): Map<Route, string> {
  const documented = new Map<Route, string>();
  for (const name of readdirSync(CONTRACT_DIR).filter((file) => file.endsWith('.md'))) {
    const text = readFileSync(join(CONTRACT_DIR, name), 'utf8');
    for (const match of text.matchAll(HEADING)) documented.set(normalize(match[1], match[2]), name);
  }
  return documented;
}

describe('docs/contract đồng bộ với route của controller', () => {
  let routes: Map<Route, string>;
  let documented: Map<Route, string>;

  beforeAll(async () => {
    routes = await collectRoutes();
    documented = collectDocumented();
  });

  it('tìm thấy route để so khớp', () => {
    expect(routes.size).toBeGreaterThan(0);
  });

  it('mọi route đều có mục `## <METHOD> <path>` trong docs/contract', () => {
    const missing = [...routes]
      .filter(([route]) => !documented.has(route))
      .map(([route, file]) => `${route}  (${file})`);
    expect(missing).toEqual([]);
  });

  it('mọi mục endpoint trong docs/contract đều ứng với route còn tồn tại', () => {
    const stale = [...documented]
      .filter(([route]) => !routes.has(route))
      .map(([route, file]) => `${route}  (${file})`);
    expect(stale).toEqual([]);
  });
});
