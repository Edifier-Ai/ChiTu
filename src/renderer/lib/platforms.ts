import { PlatformId } from '../../shared/types';
import xiaohongshuIcon from '../assets/platforms/xiaohongshu.png';
import douyinIcon from '../assets/platforms/douyin.png';
import weiboIcon from '../assets/platforms/weibo.svg';
import bilibiliIcon from '../assets/platforms/bilibili.png';

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  icon: string;
  color: string;
}

export const PLATFORM_META: PlatformMeta[] = [
  { id: 'xiaohongshu', name: '小红书', icon: xiaohongshuIcon, color: '#ff2442' },
  { id: 'douyin', name: '抖音', icon: douyinIcon, color: '#fe2c55' },
  { id: 'weibo', name: '微博', icon: weiboIcon, color: '#e6162d' },
  { id: 'bilibili', name: 'B 站', icon: bilibiliIcon, color: '#00a1d6' },
];

export const PLATFORM_NAME_MAP = PLATFORM_META.reduce<Record<string, string>>((acc, platform) => {
  acc[platform.id] = platform.name;
  return acc;
}, {});

export const PLATFORM_ICON_MAP: Record<string, string> = {
  xiaohongshu: xiaohongshuIcon,
  小红书: xiaohongshuIcon,
  douyin: douyinIcon,
  抖音: douyinIcon,
  weibo: weiboIcon,
  微博: weiboIcon,
  bilibili: bilibiliIcon,
  B站: bilibiliIcon,
  'B 站': bilibiliIcon,
};
