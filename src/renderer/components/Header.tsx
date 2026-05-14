import React from 'react';
import { EnvStatus } from '../../shared/types';
import appIcon from '../icon.png';
import './Header.css';

interface HeaderProps {
  onOpenCookieSettings?: () => void;
  appVersion?: string;
  themeMode: 'dark' | 'light';
  onToggleTheme: () => void;
  envStatus?: Pick<EnvStatus, 'ready' | 'issues'> | null;
  updateInfo?: { hasUpdate: boolean; latestVersion?: string; url?: string; error?: string } | null;
  onCheckUpdate?: () => void;
}

const Header: React.FC<HeaderProps> = ({
  onOpenCookieSettings,
  appVersion,
  envStatus,
  themeMode,
  onToggleTheme,
  updateInfo,
  onCheckUpdate,
}) => {
  const statusText = !envStatus
    ? '检测中'
    : envStatus.ready
      ? '就绪'
      : `待处理 ${envStatus.issues.length} 项`;

  return (
    <header className="ct-header">
      <div className="ct-header-content">
        <div className="ct-logo">
          <img className="ct-logo-icon-image" src={appIcon} alt="赤兔马图标" />
          <div className="ct-logo-text">
            <h1>赤兔</h1>
            <span className="ct-subtitle">数据采集系统 beta 版 v{appVersion || '...'}</span>
          </div>
        </div>
        <div className="ct-header-info">
          {updateInfo?.hasUpdate && updateInfo.url && (
            <a
              className="update-badge"
              href={updateInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`发现新版本 ${updateInfo.latestVersion}`}
            >
              🎉 有新版本 {updateInfo.latestVersion}
            </a>
          )}
          <button className="ct-theme-btn" onClick={onToggleTheme} title="切换黑白模式">
            {themeMode === 'dark' ? '☀ 白色模式' : '☾ 深色模式'}
          </button>
          <button className="ct-cookie-btn" onClick={onOpenCookieSettings} title="配置账号 Cookie">
            🔑 账号设置
          </button>
          <button className="update-btn" onClick={onCheckUpdate} title="检查更新">
            🔄
          </button>
          <span className={`ct-status-badge ${envStatus?.ready ? 'ready' : 'ct-warning'}`}>{statusText}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
