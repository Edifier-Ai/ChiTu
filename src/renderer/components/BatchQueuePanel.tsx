import React from 'react';
import { PlatformId } from '../../shared/types';
import './BatchQueuePanel.css';

export interface BatchTask {
  id: string;
  keyword: string;
  platform: PlatformId;
}

interface BatchQueuePanelProps {
  tasks: BatchTask[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onSelect: (task: BatchTask) => void;
}

const BatchQueuePanel: React.FC<BatchQueuePanelProps> = ({
  tasks,
  onRemove,
  onClear,
  onSelect,
}) => {
  if (tasks.length === 0) {
    return (
      <div className="ct-batch-queue-empty">
        <span className="ct-batch-queue-empty-title">暂无队列任务</span>
        <span className="ct-batch-queue-empty-hint">
          在采集配置页选择关键词和平台后，可批量加入队列。
        </span>
      </div>
    );
  }

  return (
    <div className="ct-batch-queue">
      <div className="ct-batch-queue-list">
        {tasks.map((task) => (
          <div key={task.id} className="ct-batch-task">
            <button className="ct-batch-task-select" onClick={() => onSelect(task)}>
              {task.platform} / {task.keyword}
            </button>
            <button className="ct-batch-task-remove" onClick={() => onRemove(task.id)}>
              删除
            </button>
          </div>
        ))}
      </div>
      <div className="ct-batch-queue-footer">
        <button className="ct-batch-clear" onClick={onClear}>
          清空队列
        </button>
        <span className="ct-batch-queue-hint">点击任务可回填到采集配置</span>
      </div>
    </div>
  );
};

export default BatchQueuePanel;
