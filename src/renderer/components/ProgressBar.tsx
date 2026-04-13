import React from 'react';
import { CrawlerProgress } from '../../shared/types';
import './ProgressBar.css';

interface ProgressBarProps {
  progress: CrawlerProgress | null;
  isCrawling: boolean;
  totalExpected: number;
  crawledCount: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  isCrawling,
  totalExpected,
  crawledCount,
}) => {
  const percentage = totalExpected > 0 ? Math.min(100, (crawledCount / totalExpected) * 100) : 0;

  return (
    <div className="progress-bar-container">
      <div className="progress-header">
        <span className="progress-title">
          {isCrawling ? '正在爬取...' : progress ? '爬取完成' : '准备就绪'}
        </span>
        <span className="progress-stats">
          已爬取 <span className="highlight">{crawledCount}</span> 条
          {totalExpected > 0 && ` / 预计 ${totalExpected} 条`}
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isCrawling && progress && (
        <div className="progress-detail">
          <span className="platform-tag">{progress.platform}</span>
          <span className="keyword-tag">"{progress.keyword}"</span>
          <span className="current-count">
            当前：{progress.current} / {progress.total}
          </span>
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
