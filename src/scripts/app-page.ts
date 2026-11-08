interface DownloadAsset {
  name: string;
  url: string;
  os: string;
  arch?: string;
  kind: string;
  size?: number;
  recommended?: boolean;
}

interface DownloadData {
  version: string;
  assets: DownloadAsset[];
}

const OS_LABELS: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
  web: 'Web',
  any: 'any platform',
};

function detectOs(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform || navigator.platform || '').toLowerCase();
  const ua = navigator.userAgent.toLowerCase();

  if (platform.includes('win') || ua.includes('windows')) return 'windows';
  if (platform.includes('mac') || /mac os|macintosh/.test(ua)) return 'macos';
  if (platform.includes('linux') || platform.includes('x11') || ua.includes('linux')) return 'linux';
  if (ua.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return '';
}

function detectArch(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/arm64|aarch64|armv8/.test(ua)) return 'arm64';
  if (/x86_64|amd64|win64|x64/.test(ua)) return 'x64';
  if (/\bi[3-6]86\b|\bx86\b/.test(ua)) return 'x86';
  return '';
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

const dataElement = document.getElementById('download-data');
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-os-tab]')];
const groups = [...document.querySelectorAll<HTMLElement>('[data-os-group]')];

function selectOs(os: string) {
  const hasGroup = groups.some((group) => group.dataset.osGroup === os);
  const target = hasGroup ? os : groups[0]?.dataset.osGroup;
  if (!target) return;

  for (const tab of tabs) {
    tab.setAttribute('aria-selected', String(tab.dataset.osTab === target));
    tab.tabIndex = tab.dataset.osTab === target ? 0 : -1;
  }
  for (const group of groups) {
    group.hidden = group.dataset.osGroup !== target;
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => selectOs(tab.dataset.osTab ?? ''));
}

if (groups.length > 0) selectOs(detectOs());

if (dataElement?.textContent) {
  let data: DownloadData;
  try {
    data = JSON.parse(dataElement.textContent) as DownloadData;
  } catch {
    data = { version: '', assets: [] };
  }

  const os = detectOs();
  const arch = detectArch();
  const forOs = data.assets.filter((asset) => asset.os === os);
  const candidates = forOs.length > 0 ? forOs : data.assets.filter((asset) => asset.os === 'any');
  const archMatches = (asset: DownloadAsset) =>
    !arch || !asset.arch || asset.arch === 'any' || asset.arch === 'universal' || asset.arch === arch;

  const chosen =
    candidates.find((asset) => asset.recommended && archMatches(asset)) ??
    candidates.find((asset) => asset.recommended) ??
    candidates.find((asset) => archMatches(asset) && asset.kind !== 'other') ??
    candidates.find((asset) => asset.kind !== 'other') ??
    candidates[0];

  const primary = document.getElementById('primary-download');
  const label = document.getElementById('primary-download-label');
  const note = document.getElementById('download-note');

  if (chosen && primary && label) {
    primary.setAttribute('href', chosen.url);
    primary.setAttribute('rel', 'noopener noreferrer');
    const osName = OS_LABELS[chosen.os] ?? chosen.os;
    label.textContent = `Download for ${osName}`;
    if (note) {
      const size = formatBytes(chosen.size);
      note.textContent = [chosen.name, size].filter(Boolean).join(' · ');
    }
    const versionLabel = document.getElementById('download-version');
    if (versionLabel) versionLabel.textContent = data.version;
  } else if (note) {
    note.textContent = `Version ${data.version} · ${data.assets.length} file${data.assets.length === 1 ? '' : 's'} available`;
  }
}

export {};
