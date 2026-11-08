export const OSES = ['windows', 'macos', 'linux', 'android', 'ios', 'web', 'any'] as const;
export type Os = (typeof OSES)[number];

export const ARCHES = ['x64', 'arm64', 'x86', 'universal', 'any'] as const;
export type Arch = (typeof ARCHES)[number];

export const ASSET_KINDS = [
  'installer',
  'portable',
  'archive',
  'package',
  'script',
  'dmg',
  'msi',
  'deb',
  'rpm',
  'appimage',
  'binary',
  'other',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const CATEGORIES = [
  'developer-tools',
  'productivity',
  'media',
  'security',
  'networking',
  'utilities',
  'education',
  'games',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CHANNELS = ['stable', 'beta', 'nightly'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface Asset {
  name: string;
  url: string;
  os: Os;
  arch?: Arch;
  kind: AssetKind;
  label?: string;
  recommended?: boolean;
  size?: number;
  sha256?: string;
  sig?: string;
}

export interface Release {
  version: string;
  date: string;
  channel?: Channel;
  title?: string;
  notes?: string;
  assets: Asset[];
}

export interface Links {
  repo?: string;
  homepage?: string;
  docs?: string;
  changelog?: string;
  issues?: string;
  discussions?: string;
  donate?: string;
}

export interface Install {
  brew?: string;
  scoop?: string;
  winget?: string;
  choco?: string;
  cargo?: string;
  npm?: string;
  pypi?: string;
  pipx?: string;
  go?: string;
  docker?: string;
  script?: string;
  powershell?: string;
}

export interface App {
  $schema?: string;
  id: string;
  name: string;
  tagline: string;
  description?: string;
  category: Category;
  tags?: string[];
  icon?: string;
  accent?: string;
  featured?: boolean;
  license?: string;
  author?: { name: string; url?: string };
  links: Links;
  platforms?: Os[];
  install?: Install;
  releases: Release[];
}
