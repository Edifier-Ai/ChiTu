import React, { useState, useEffect } from 'react';
import { PlatformId, AiConfig } from '../../shared/types';
import { PLATFORM_META } from '../lib/platforms';
import './SettingsModal.css';

interface SettingsModalProps {
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

type MainTab = 'cookies' | 'ai';

const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onClose, onSaved }) => {
  const [mainTab, setMainTab] = useState<MainTab>('cookies');
  const [cookies, setCookies] = useState<Record<string, string>>({});
  const [aiConfig, setAiConfig] = useState<AiConfig>({ baseUrl: '', apiKey: '', model: '' });
  
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activePlatformTab, setActivePlatformTab] = useState<PlatformId>('xiaohongshu');

  useEffect(() => {
    if (visible) {
      window.electronAPI.loadCookies().then((loaded: Record<string, string>) => {
        setCookies(loaded || {});
      });
      window.electronAPI.loadSettings().then((loaded) => {
        if (loaded.ai) {
          setAiConfig(loaded.ai);
        }
      });
    }
  }, [visible]);

  const handleSave = async () => {
    setSaving(true);
    
    // Save cookies
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
    await window.electronAPI.saveCookies(converted);
    setCookies(converted);

    // Save AI Settings
    await window.electronAPI.saveSettings({ ai: aiConfig });

    setSaving(false);
    setSaved(true);
    onSaved?.();
    setTimeout(() => setSaved(false), 2000);
  };

  if (!visible) return null;

  const activePlatform = PLATFORMS.find(p => p.id === activePlatformTab);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>
        
        <div className="settings-main-tabs">
          <button className={`settings-main-tab ${mainTab === 'cookies' ? 'active' : ''}`} onClick={() => setMainTab('cookies')}>账号 Cookie</button>
          <button className={`settings-main-tab ${mainTab === 'ai' ? 'active' : ''}`} onClick={() => setMainTab('ai')}>AI 分析配置</button>
        </div>

        {mainTab === 'cookies' && (
          <>
            <p className="settings-desc">
              配置各平台的登录 Cookie，才能采集真实数据。Cookie 保存在本机，不会上传到任何服务器。
            </p>
            <div className="settings-tabs">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  className={`settings-tab ${activePlatformTab === p.id ? 'active' : ''} ${cookies[p.id] ? 'has-cookie' : ''}`}
                  onClick={() => setActivePlatformTab(p.id)}
                >
                  <img src={p.icon} alt={p.name} className="settings-platform-icon" /> {p.name}
                  {cookies[p.id] && <span className="tab-badge">✓</span>}
                </button>
              ))}
            </div>
            {activePlatform && (
              <div className="settings-content">
                <div className="settings-hint" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>💡 {activePlatform.hint}</span>
                  <button 
                    className="settings-save-btn" 
                    style={{ padding: '4px 12px', fontSize: '12px', marginLeft: '12px' }}
                    onClick={async () => {
                      const cookieStr = await window.electronAPI.openLoginWindow(activePlatformTab);
                      if (cookieStr) {
                        setCookies(prev => ({ ...prev, [activePlatformTab]: cookieStr }));
                      }
                    }}
                  >
                    一键登录获取
                  </button>
                </div>
                <textarea
                  className="settings-textarea"
                  placeholder={`粘贴 ${activePlatform.name} 的 Cookie 字符串...`}
                  value={cookies[activePlatformTab] || ''}
                  onChange={(e) => setCookies(prev => ({ ...prev, [activePlatformTab]: e.target.value }))}
                  rows={8}
                />
              </div>
            )}
          </>
        )}

        {mainTab === 'ai' && (
          <div className="settings-ai-content">
            <p className="settings-desc">
              配置 OpenAI 兼容的 API 信息，用于数据大盘的深度智能分析。
            </p>
            <div className="form-group">
              <label>API Base URL</label>
              <input 
                type="text" 
                placeholder="例如：https://api.openai.com" 
                value={aiConfig.baseUrl}
                onChange={(e) => setAiConfig({...aiConfig, baseUrl: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>API Key</label>
              <input 
                type="password" 
                placeholder="sk-..." 
                value={aiConfig.apiKey}
                onChange={(e) => setAiConfig({...aiConfig, apiKey: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Model</label>
              <input 
                type="text" 
                placeholder="例如：gpt-4o" 
                value={aiConfig.model}
                onChange={(e) => setAiConfig({...aiConfig, model: e.target.value})}
              />
            </div>
          </div>
        )}

        <div className="settings-footer">
          <button className="settings-cancel" onClick={onClose}>取消</button>
          <button className="settings-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : saved ? '✓ 已保存' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;