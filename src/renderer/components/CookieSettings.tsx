import React, { useState, useEffect } from 'react';
import { PlatformId } from '../../shared/types';
import { PLATFORM_META, PLATFORM_NAME_MAP } from '../lib/platforms';
import './CookieSettings.css';

interface CookieSettingsProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const PLATFORM_HINTS: Record<PlatformId, string> = {
  xiaohongshu: '在浏览器登录小红书后，按 F12 → Application → Cookies → www.xiaohongshu.com，复制全部 Cookie 字符串',
  douyin: '在浏览器登录抖音后，按 F12 → Application → Cookies → www.douyin.com，复制全部 Cookie 字符串',
  weibo: '在浏览器登录微博后，按 F12 → Application → Cookies → weibo.com，复制全部 Cookie 字符串',
  bilibili: '在浏览器登录B站后，按 F12 → Application → Cookies → bilibili.com，复制全部 Cookie 字符串',
};

const PLATFORMS = PLATFORM_META.map((platform) => ({
  ...platform,
  hint: PLATFORM_HINTS[platform.id],
}));

function parseCookieString(cookieStr: string): Record<string, string> {
  const dict: Record<string, string> = {};
  for (const cookie of cookieStr.split(';')) {
    const trimmed = cookie.trim();
    if (!trimmed || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    dict[key.trim()] = rest.join('=').trim();
  }
  return dict;
}

function validatePlatformCookie(platformId: PlatformId, cookieStr: string): string | null {
  const trimmed = cookieStr.trim();
  if (!trimmed) return null;

  const dict = parseCookieString(trimmed);
  if (!Object.keys(dict).length) return null;

  if (platformId === 'xiaohongshu') {
    if (!dict['a1'] || !dict['web_session']) {
      return '小红书 Cookie 缺少关键字段：至少需要 a1 和 web_session';
    }
  }

  if (platformId === 'bilibili') {
    if (!dict['SESSDATA']) {
      return 'B站 Cookie 缺少关键字段：至少需要 SESSDATA';
    }
  }

  return null;
}

const CookieSettings: React.FC<CookieSettingsProps> = ({ visible, onClose, onSaved }) => {
  const [cookies, setCookies] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<PlatformId>('xiaohongshu');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [autoFetching, setAutoFetching] = useState<PlatformId | null>(null);
  const [autoFetchMessage, setAutoFetchMessage] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      window.electronAPI.loadCookies().then((loaded: Record<string, string>) => {
        setCookies(loaded || {});
      });
      setValidationError(null);
      setAutoFetchMessage(null);
    }
  }, [visible]);

  const handleAutoFetch = async (platform: PlatformId) => {
    setActiveTab(platform);
    setAutoFetching(platform);
    setValidationError(null);
    setAutoFetchMessage(`正在打开${PLATFORM_NAME_MAP[platform]}登录窗口...`);

    try {
      const result = await window.electronAPI.autoFetchCookie(platform);
      if (!result.success || !result.cookie) {
        setAutoFetchMessage(result.error || `${PLATFORM_NAME_MAP[platform]} Cookie 自动获取失败`);
        return;
      }

      setCookies((prev) => ({ ...prev, [platform]: result.cookie || '' }));
      setAutoFetchMessage(`${PLATFORM_NAME_MAP[platform]} Cookie 已自动保存`);
      onSaved?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : `${PLATFORM_NAME_MAP[platform]} Cookie 自动获取失败`;
      setAutoFetchMessage(message);
    } finally {
      setAutoFetching(null);
    }
  };

  const handleSave = async () => {
    // 前端校验各平台 Cookie
    const errors: string[] = [];
    for (const [platform, rawValue] of Object.entries(cookies)) {
      const err = validatePlatformCookie(platform as PlatformId, rawValue);
      if (err) errors.push(`${PLATFORM_NAME_MAP[platform] || platform}: ${err}`);
    }
    if (errors.length > 0) {
      setValidationError(errors.join('；'));
      return;
    }

    // 自动检测并转换 JSON 格式 Cookie（EditThisCookie 导出格式）
    const converted: Record<string, string> = {};
    for (const [platform, rawValue] of Object.entries(cookies)) {
      const trimmed = rawValue.trim();
      if (trimmed.startsWith('[')) {
        try {
          const arr = JSON.parse(trimmed);
          if (Array.isArray(arr)) {
            converted[platform] = arr
              .map((c: any) => `${c.name}=${c.value}`)
              .join('; ');
            continue;
          }
        } catch {}
      }
      converted[platform] = rawValue;
    }

    setValidationError(null);
    setSaving(true);
    await window.electronAPI.saveCookies(converted);
    setCookies(converted);
    setSaving(false);
    setSaved(true);
    onSaved?.();
    setTimeout(() => setSaved(false), 2000);
  };

  if (!visible) return null;

  const activePlatform = PLATFORMS.find(p => p.id === activeTab);

  return (
    <div className="ct-cookie-overlay" onClick={onClose}>
      <div className="ct-cookie-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ct-cookie-header">
          <h2>账号 Cookie 配置</h2>
          <button className="ct-cookie-close" onClick={onClose}>×</button>
        </div>
        <p className="ct-cookie-desc">
          配置各平台的登录 Cookie，才能采集真实数据。Cookie 保存在本机，不会上传到任何服务器。
        </p>
        <div className="ct-cookie-tabs">
          {PLATFORMS.map(p => (
            <button
              key={p.id}
              className={`ct-cookie-tab ${activeTab === p.id ? 'ct-active' : ''} ${cookies[p.id] ? 'ct-has-cookie' : ''}`}
              onClick={() => setActiveTab(p.id)}
            >
              {p.icon} {p.name}
              {cookies[p.id] && <span className="ct-tab-badge">✓</span>}
            </button>
          ))}
        </div>
        {activePlatform && (
          <div className="ct-cookie-content">
            <div className="ct-cookie-hint">
              💡 {activePlatform.hint}
            </div>
            <div className="ct-cookie-auto-row">
              <button
                className="ct-cookie-auto"
                onClick={() => handleAutoFetch(activeTab)}
                disabled={Boolean(autoFetching)}
              >
                {autoFetching === activeTab ? '等待登录中...' : `自动获取 ${activePlatform.name} Cookie`}
              </button>
              <span className="ct-cookie-auto-note">
                会打开登录窗口，登录成功后自动保存到本机。
              </span>
            </div>
            {autoFetchMessage && (
              <div className={`ct-cookie-message ${autoFetchMessage.includes('已自动保存') ? 'ct-success' : ''}`}>
                {autoFetchMessage}
              </div>
            )}
            <textarea
              className="ct-cookie-textarea"
              placeholder={`粘贴 ${activePlatform.name} 的 Cookie 字符串...`}
              value={cookies[activeTab] || ''}
              onChange={(e) => {
                setCookies(prev => ({ ...prev, [activeTab]: e.target.value }));
                setValidationError(null);
              }}
              rows={8}
            />
            {validationError && (
              <div style={{ color: '#f87171', fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
                {validationError.includes(PLATFORM_NAME_MAP[activeTab] || '') ? validationError : ''}
              </div>
            )}
          </div>
        )}
        <div className="ct-cookie-footer">
          <button className="ct-cookie-cancel" onClick={onClose}>取消</button>
          <button className="ct-cookie-save" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : saved ? '✓ 已保存' : '保存 Cookie'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieSettings;
