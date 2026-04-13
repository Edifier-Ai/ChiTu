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
}

const Header: React.FC<HeaderProps> = ({
  onOpenCookieSettings,
  appVersion,
  envStatus,
  themeMode,
  onToggleTheme,
}) => {
  const statusText = !envStatus
    ? '检测中'
    : envStatus.ready
      ? '就绪'
      : `待处理 ${envStatus.issues.length} 项`;

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <img className="logo-icon-image" src={appIcon} alt="赤兔马图标" />
          <div className="logo-text">
            <h1>赤兔</h1>
            <span className="subtitle">数据采集系统 beta 版 v{appVersion || '...'}</span>
          </div>
        </div>
        <div className="header-info">
          <button className="theme-btn" onClick={onToggleTheme} title="切换黑白模式">
            {themeMode === 'dark' ? '☀ 白色模式' : '☾ 深色模式'}
          </button>
          <button className="cookie-btn" onClick={onOpenCookieSettings} title="配置账号 Cookie">
            🔑 账号设置
          </button>
          <span className={`status-badge ${envStatus?.ready ? 'ready' : 'warning'}`}>{statusText}</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
