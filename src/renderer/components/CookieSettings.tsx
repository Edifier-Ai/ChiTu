import React, { useState, useEffect } from 'react';
import { PlatformId } from '../../shared/types';
import { PLATFORM_META } from '../lib/platforms';
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

const CookieSettings: React.FC<CookieSettingsProps> = ({ visible, onClose, onSaved }) => {
  const [cookies, setCookies] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<PlatformId>('xiaohongshu');

  useEffect(() => {
    if (visible) {
      window.electronAPI.loadCookies().then((loaded: Record<string, string>) => {
        setCookies(loaded || {});
      });
    }
  }, [visible]);

  const handleSave = async () => {
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
    <div className="cookie-overlay" onClick={onClose}>
      <div className="cookie-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cookie-header">
          <h2>账号 Cookie 配置</h2>
          <button className="cookie-close" onClick={onClose}>×</button>
        </div>
        <p className="cookie-desc">
          配置各平台的登录 Cookie，才能采集真实数据。Cookie 保存在本机，不会上传到任何服务器。
        </p>
        <div className="cookie-tabs">
          {PLATFORMS.map(p => (
            <button
              key={p.id}
              className={`cookie-tab ${activeTab === p.id ? 'active' : ''} ${cookies[p.id] ? 'has-cookie' : ''}`}
              onClick={() => setActiveTab(p.id)}
            >
              <img src={p.icon} alt={p.name} className="cookie-platform-icon" /> {p.name}
              {cookies[p.id] && <span className="tab-badge">✓</span>}
            </button>
          ))}
        </div>
        {activePlatform && (
          <div className="cookie-content">
            <div className="cookie-hint" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>💡 {activePlatform.hint}</span>
              <button 
                className="cookie-save" 
                style={{ padding: '4px 12px', fontSize: '12px', marginLeft: '12px' }}
                onClick={async () => {
                  const cookieStr = await window.electronAPI.openLoginWindow(activeTab);
                  if (cookieStr) {
                    setCookies(prev => ({ ...prev, [activeTab]: cookieStr }));
                  }
                }}
              >
                一键登录获取
              </button>
            </div>
            <textarea
              className="cookie-textarea"
              placeholder={`粘贴 ${activePlatform.name} 的 Cookie 字符串...`}
              value={cookies[activeTab] || ''}
              onChange={(e) => setCookies(prev => ({ ...prev, [activeTab]: e.target.value }))}
              rows={8}
            />
          </div>
        )}
        <div className="cookie-footer">
          <button className="cookie-cancel" onClick={onClose}>取消</button>
          <button className="cookie-save" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : saved ? '✓ 已保存' : '保存 Cookie'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieSettings;
