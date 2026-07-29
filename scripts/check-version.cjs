const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.env.YAM_PROJECT_ROOT || path.join(__dirname, '..'));
const args = process.argv.slice(2);
const tagIndex = args.indexOf('--tag');
const releaseMode = args.includes('--release') || tagIndex !== -1;
const tag = tagIndex === -1 ? null : args[tagIndex + 1];
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function fail(message) {
  console.error(`[version:check] ERROR: ${message}`);
  process.exitCode = 1;
}

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取 ${relativePath}: ${error.message}`);
  }
}

try {
  if (tagIndex !== -1 && (!tag || tag.startsWith('--'))) {
    throw new Error('--tag 需要一个参数，例如 --tag v1.2.3');
  }

  const packageVersion = readJson('yam-desktop/package.json').version;
  const tauriVersion = readJson('yam-desktop/src-tauri/tauri.conf.json').version;
  const cargoPath = path.join(root, 'yam-desktop/src-tauri/Cargo.toml');
  const cargo = fs.readFileSync(cargoPath, 'utf8');
  const packageSection = cargo.match(/^\[package\]\s*\r?\n([\s\S]*?)(?=^\[|\z)/m);
  const cargoVersion = packageSection?.[1].match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];

  const versions = {
    'yam-desktop/package.json': packageVersion,
    'yam-desktop/src-tauri/Cargo.toml': cargoVersion,
    'yam-desktop/src-tauri/tauri.conf.json': tauriVersion,
  };

  for (const [file, version] of Object.entries(versions)) {
    if (!version) fail(`${file} 中缺少版本号`);
    else if (!semverPattern.test(version)) fail(`${file} 中的版本 "${version}" 不是有效 semver`);
  }

  const uniqueVersions = new Set(Object.values(versions));
  if (uniqueVersions.size !== 1) {
    fail(`版本不一致：${Object.entries(versions).map(([file, version]) => `${file}=${version ?? '<missing>'}`).join(', ')}`);
  }

  const version = packageVersion;
  if (tag) {
    if (!tag.startsWith('v') || !semverPattern.test(tag.slice(1))) {
      fail(`tag "${tag}" 格式无效，应为 v<semver>`);
    } else if (tag.slice(1) !== version) {
      fail(`tag 版本 ${tag.slice(1)} 与项目版本 ${version} 不一致`);
    }
  }

  if (releaseMode) {
    const notesPath = path.join(root, 'release/RELEASE-NOTES.md');
    let notes;
    try {
      notes = fs.readFileSync(notesPath, 'utf8');
    } catch (error) {
      throw new Error(`正式发布需要 release/RELEASE-NOTES.md: ${error.message}`);
    }
    const header = notes.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
    const notesVersion = header.match(/(?:^|\s)v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\s*$/)?.[1];
    if (!notesVersion) fail('release/RELEASE-NOTES.md 首行必须以发布 semver 版本结尾');
    else if (notesVersion !== version) fail(`发布说明版本 ${notesVersion} 与项目版本 ${version} 不一致`);
  }

  if (!process.exitCode) {
    console.log(`[version:check] OK: 所有版本均为 ${version}${tag ? `，tag ${tag} 匹配` : ''}${releaseMode ? '，发布说明匹配' : ''}`);
  }
} catch (error) {
  fail(error.message);
}
