import React from 'react';
import './ActionButtons.css';

interface ActionButtonsProps {
  isCrawling: boolean;
  onStart: () => void;
  onStop: () => void;
  onExport: () => void;
  canExport: boolean;
  disableStart?: boolean;
  startLabel?: string;
  stopLabel?: string;
  exportLabel?: string;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  isCrawling,
  onStart,
  onStop,
  onExport,
  canExport,
  disableStart,
  startLabel = '开始爬取',
  stopLabel = '停止爬取',
  exportLabel = '导出数据',
}) => {
  return (
    <div className="ct-action-buttons">
      {!isCrawling ? (
        <button className="ct-start-btn" onClick={onStart} disabled={disableStart}>
          <span className="ct-btn-icon">▶</span>
          {startLabel}
        </button>
      ) : (
        <button className="ct-stop-btn" onClick={onStop}>
          <span className="ct-btn-icon">⏹</span>
          {stopLabel}
        </button>
      )}
      <button
        className="ct-export-btn"
        onClick={onExport}
        disabled={!canExport || isCrawling}
      >
        <span className="ct-btn-icon">📥</span>
        {exportLabel}
      </button>
    </div>
  );
};

export default ActionButtons;
