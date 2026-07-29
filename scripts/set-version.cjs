const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.env.YAM_PROJECT_ROOT || path.join(__dirname, '..'));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const version = args.find((arg) => arg !== '--dry-run');
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!version || !semverPattern.test(version)) {
  console.error('用法: node scripts/set-version.cjs [--dry-run] <semver>');
  process.exit(1);
}

const changes = [];

function stageJson(relativePath, update) {
  const filePath = path.join(root, relativePath);
  const original = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(original);
  update(data);
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const content = `${JSON.stringify(data, null, 2)}${newline}`.replace(/\n/g, newline);
  changes.push({ relativePath, filePath, content });
}

stageJson('yam-desktop/package.json', (data) => { data.version = version; });
stageJson('yam-desktop/package-lock.json', (data) => {
  data.version = version;
  if (!data.packages?.['']) throw new Error('package-lock.json 缺少 packages[""]');
  data.packages[''].version = version;
});
stageJson('yam-desktop/src-tauri/tauri.conf.json', (data) => { data.version = version; });

const cargoRelativePath = 'yam-desktop/src-tauri/Cargo.toml';
const cargoPath = path.join(root, cargoRelativePath);
const cargoOriginal = fs.readFileSync(cargoPath, 'utf8');
const packageSectionPattern = /(^\[package\]\s*$[\s\S]*?^version\s*=\s*")[^"]+("\s*$)/m;
if (!packageSectionPattern.test(cargoOriginal)) throw new Error('Cargo.toml 的 [package] 中缺少 version');
changes.push({
  relativePath: cargoRelativePath,
  filePath: cargoPath,
  content: cargoOriginal.replace(packageSectionPattern, `$1${version}$2`),
});

for (const change of changes) {
  console.log(`[set-version] ${dryRun ? '将更新' : '更新'} ${change.relativePath} -> ${version}`);
  if (!dryRun) fs.writeFileSync(change.filePath, change.content, 'utf8');
}
console.log(`[set-version] ${dryRun ? 'dry-run 完成，未写入文件' : `版本已同步为 ${version}`}；未创建 commit 或 tag`);
