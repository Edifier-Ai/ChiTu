import { describe, it, expect } from 'vitest';
import { PLATFORM_META, PLATFORM_NAME_MAP, PLATFORM_ICON_MAP } from './platforms';

describe('platforms', () => {
  it('PLATFORM_META should contain all 4 platforms', () => {
    expect(PLATFORM_META).toHaveLength(4);
    const ids = PLATFORM_META.map((p) => p.id);
    expect(ids).toContain('xiaohongshu');
    expect(ids).toContain('douyin');
    expect(ids).toContain('weibo');
    expect(ids).toContain('bilibili');
  });

  it('PLATFORM_NAME_MAP should map ids to names', () => {
    expect(PLATFORM_NAME_MAP['xiaohongshu']).toBe('小红书');
    expect(PLATFORM_NAME_MAP['douyin']).toBe('抖音');
    expect(PLATFORM_NAME_MAP['weibo']).toBe('微博');
    expect(PLATFORM_NAME_MAP['bilibili']).toBe('B 站');
  });

  it('PLATFORM_ICON_MAP should support both id and name keys', () => {
    expect(PLATFORM_ICON_MAP['xiaohongshu']).toBe('📕');
    expect(PLATFORM_ICON_MAP['小红书']).toBe('📕');
    expect(PLATFORM_ICON_MAP['douyin']).toBe('🎵');
    expect(PLATFORM_ICON_MAP['抖音']).toBe('🎵');
  });
});
