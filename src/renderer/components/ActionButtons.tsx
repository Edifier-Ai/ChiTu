import React from 'react';
import './ActionButtons.css';

interface ActionButtonsProps {
  isCrawling: boolean;
  onStart: () => void;
  onStop: () => void;
  onExport: () => void;
  canExport: boolean;
  disableStart?: boolean;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  isCrawling,
  onStart,
  onStop,
  onExport,
  canExport,
  disableStart,
}) => {
  return (
    <div className="action-buttons">
      {!isCrawling ? (
        <button className="start-btn" onClick={onStart} disabled={disableStart}>
          <span className="btn-icon">▶</span>
          开始爬取
        </button>
      ) : (
        <button className="stop-btn" onClick={onStop}>
          <span className="btn-icon">⏹</span>
          停止爬取
        </button>
      )}
      <button
        className="export-btn"
        onClick={onExport}
        disabled={!canExport || isCrawling}
      >
        <span className="btn-icon">📥</span>
        导出数据
      </button>
    </div>
  );
};

export default ActionButtons;
