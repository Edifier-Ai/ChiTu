import { PlatformId } from '../../shared/types';

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  icon: string;
  color: string;
}

export const PLATFORM_META: PlatformMeta[] = [
  { id: 'xiaohongshu', name: '小红书', icon: '📕', color: '#ff2442' },
  { id: 'douyin', name: '抖音', icon: '🎵', color: '#fe2c55' },
  { id: 'weibo', name: '微博', icon: '📱', color: '#e6162d' },
  { id: 'bilibili', name: 'B 站', icon: '📺', color: '#00a1d6' },
];

export const PLATFORM_NAME_MAP = PLATFORM_META.reduce<Record<string, string>>((acc, platform) => {
  acc[platform.id] = platform.name;
  return acc;
}, {});

export const PLATFORM_ICON_MAP: Record<string, string> = {
  xiaohongshu: '📕',
  小红书: '📕',
  douyin: '🎵',
  抖音: '🎵',
  weibo: '📱',
  微博: '📱',
  bilibili: '📺',
  B站: '📺',
  'B 站': '📺',
};
