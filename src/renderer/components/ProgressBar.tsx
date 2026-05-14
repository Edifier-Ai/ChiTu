import React from 'react';
import { CrawlerProgress } from '../../shared/types';
import './ProgressBar.css';

interface ProgressBarProps {
  progress: CrawlerProgress | null;
  isCrawling: boolean;
  crawledCount: number;
  activeLabel?: string;
  doneLabel?: string;
  countLabel?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  isCrawling,
  crawledCount,
  activeLabel = '正在爬取...',
  doneLabel = '爬取完成',
  countLabel = '已爬取',
}) => {
  const hasPlatformProgress = progress && progress.total > 0;
  const percentage = hasPlatformProgress
    ? Math.min(100, (progress.current / progress.total) * 100)
    : isCrawling
      ? 0
      : crawledCount > 0
        ? 100
        : 0;

  return (
    <div className="ct-progress-bar-container">
      <div className="ct-progress-header">
        <span className="ct-progress-title">
          {isCrawling ? activeLabel : progress ? doneLabel : '准备就绪'}
        </span>
        <span className="ct-progress-stats">
          {isCrawling
            ? `${countLabel} ${crawledCount} 条`
            : crawledCount > 0
              ? `共 ${crawledCount} 条`
              : '等待开始'}
        </span>
      </div>
      <div className="ct-progress-track">
        <div
          className="ct-progress-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isCrawling && progress && (
        <div className="ct-progress-detail">
          <span className="ct-platform-tag">{progress.platform}</span>
          <span className="ct-keyword-tag">"{progress.keyword}"</span>
          <span className="ct-current-count">
            当前：{progress.current} / {progress.total}
          </span>
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
