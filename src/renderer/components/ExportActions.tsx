import React from 'react';

interface ExportActionsProps {
  filePath: string;
}

const ExportActions: React.FC<ExportActionsProps> = ({ filePath }) => {
  const handleOpenFolder = async () => {
    await window.electronAPI.openFolder(filePath);
  };

  const handleCopyPath = async () => {
    await window.electronAPI.copyToClipboard(filePath);
  };

  return (
    <div className="ct-export-actions">
      <span className="ct-export-path">{filePath}</span>
      <div className="ct-export-actions-btns">
        <button className="ct-export-btn" onClick={handleOpenFolder}>
          打开文件夹
        </button>
        <button className="ct-export-btn secondary" onClick={handleCopyPath}>
          复制路径
        </button>
      </div>
    </div>
  );
};

export default ExportActions;
