import React from 'react';
import { EmployeeAccountResult } from '../../shared/types';
import './AccountResults.css';

interface AccountResultsProps {
  data: EmployeeAccountResult[];
}

function formatFollowers(item: EmployeeAccountResult) {
  if (item.followersCount == null) {
    return item.followersText || '未知';
  }
  if (item.followersCount >= 10000) {
    return `${(item.followersCount / 10000).toFixed(1)}万`;
  }
  return String(item.followersCount);
}

const AccountResults: React.FC<AccountResultsProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="ct-account-results ct-account-empty">
        <div className="ct-account-empty-state">
          <span className="ct-account-empty-icon">ID</span>
          <span className="ct-account-empty-text">暂无账号识别结果</span>
          <span className="ct-account-empty-hint">开始识别后，疑似员工账号将在这里实时展示</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ct-account-results">
      <div className="ct-account-results-header">
        <span className="ct-account-results-title">员工账号识别结果</span>
        <span className="ct-account-results-count">共 {data.length} 个账号</span>
      </div>
      <div className="ct-account-table-wrap">
        <table className="ct-account-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>平台名称</th>
              <th>账号名</th>
              <th>疑似员工名</th>
              <th>用户ID</th>
              <th>粉丝数</th>
              <th>置信度</th>
              <th>命中证据</th>
              <th>主页链接</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={`${item.platform}-${item.userId}-${item.rank}`}>
                <td className="ct-account-rank">{item.rank}</td>
                <td>{item.platformName}</td>
                <td className="ct-account-name">{item.accountName}</td>
                <td>{item.suspectedEmployeeName}</td>
                <td className="ct-account-user-id">{item.userId || '未知'}</td>
                <td>{formatFollowers(item)}</td>
                <td>
                  <span className={`ct-confidence ct-confidence-${item.confidenceLevel}`}>
                    {item.confidenceLevel} {item.confidenceScore}
                  </span>
                </td>
                <td className="ct-account-evidence">{item.evidence.join('；')}</td>
                <td>
                  {item.profileUrl ? (
                    <a href={item.profileUrl} target="_blank" rel="noopener noreferrer">
                      打开
                    </a>
                  ) : (
                    '未知'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccountResults;
