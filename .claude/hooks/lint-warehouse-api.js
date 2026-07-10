// PostToolUse hook (Write|Edit): eslint --fix the touched file if it lives under app/warehouse-api/src.
const path = require('path');
const { spawnSync } = require('child_process');

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return;
  }

  const filePath = payload?.tool_response?.filePath || payload?.tool_input?.file_path;
  if (!filePath) return;

  const normalized = filePath.replace(/\\/g, '/');
  const marker = 'app/warehouse-api/src/';
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1 || !normalized.endsWith('.ts')) return;

  const repoRoot = path.resolve(__dirname, '..', '..');
  const apiDir = path.join(repoRoot, 'app', 'warehouse-api');
  const absFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  const eslintBin = path.join(
    apiDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'eslint.cmd' : 'eslint',
  );

  const result = spawnSync(eslintBin, ['--fix', absFilePath], {
    cwd: apiDir,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    // Non-zero = lint errors remain after --fix. Surface to Claude via stderr + exit 2 (blocking feedback).
    process.exit(2);
  }
});
