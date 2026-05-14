import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AutoSizer, AutoSizerChildProps } from 'react-virtualized-auto-sizer';
import { List, ListImperativeAPI, RowComponentProps } from 'react-window';
import { CrawledItem } from '../../shared/types';
import { PLATFORM_ICON_MAP, PLATFORM_NAME_MAP } from '../lib/platforms';
import './ContentPreview.css';

interface ContentPreviewProps {
  data: CrawledItem[];
  onQuickDemo?: () => void;
  filteredData?: CrawledItem[];
}

interface PreviewRowProps {
  items: CrawledItem[];
  expandedIds: string[];
  onToggleExpanded: (id: string) => void;
}

function getItemKey(item: CrawledItem) {
  return `${item.platform}::${item.keyword}::${item.id}::${item.timestamp}`;
}

function formatTime(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleString('zh-CN');
  } catch {
    return timestamp;
  }
}

function truncateContent(content: string, maxLength = 150) {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, maxLength)}...`;
}

const COLLAPSED_COMMENT_COUNT = 2;

function getVisibleComments(item: CrawledItem, expanded: boolean) {
  const comments = item.comments || [];
  return expanded ? comments : comments.slice(0, COLLAPSED_COMMENT_COUNT);
}

function getRowHeight(item: CrawledItem, expanded: boolean) {
  const visibleCommentCount = getVisibleComments(item, expanded).length;
  const hasComments = (item.comments?.length || 0) > 0;
  const hiddenCommentCount = Math.max((item.comments?.length || 0) - visibleCommentCount, 0);
  const threadHeight = hasComments ? 44 + visibleCommentCount * 88 + (hiddenCommentCount > 0 ? 38 : 0) : 0;
  return 152 + threadHeight;
}

function PreviewRow({ index, style, items, expandedIds, onToggleExpanded }: RowComponentProps<PreviewRowProps>) {
  const item = items[index];
  const itemKey = getItemKey(item);
  const isExpanded = expandedIds.includes(itemKey);
  const commentCount = item.comments?.length || 0;
  const visibleComments = getVisibleComments(item, isExpanded);
  const hiddenCommentCount = Math.max(commentCount - visibleComments.length, 0);

  return (
    <div style={style} className="ct-preview-row">
      <div className="ct-preview-item ct-preview-item-rich" aria-label={`${item.platform}-${item.keyword}`}>
        <div className="ct-item-header">
          <span className="ct-item-platform">
            {PLATFORM_ICON_MAP[item.platform] || '📄'} {PLATFORM_NAME_MAP[item.platform] || item.platform}
          </span>
          <span className="ct-item-keyword">{item.keyword}</span>
          <span className="ct-item-time">{formatTime(item.timestamp)}</span>
        </div>
        <div className="ct-item-content">{truncateContent(item.content)}</div>
        <div className="ct-item-footer">
          <span className="ct-item-author">@{item.author}</span>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ct-item-link"
            >
              原文链接 →
            </a>
          )}
          {commentCount > 0 && <span className="ct-item-comments">💬 {commentCount} 条评论</span>}
        </div>
        {commentCount > 0 && (
          <div className="ct-comment-thread">
            <div className="ct-comment-thread-header">
              <div className="ct-comment-thread-title">
                <span className="ct-comment-thread-dot" />
                评论区
              </div>
              <button
                className="ct-item-comments ct-item-comments-btn"
                onClick={() => onToggleExpanded(itemKey)}
              >
                {isExpanded ? '收起评论' : `展开全部 ${commentCount} 条`}
              </button>
            </div>
            <div className="ct-comment-preview-list">
              {visibleComments.map((comment, commentIndex) => (
                <div className="ct-comment-preview-item" key={comment.id}>
                  <div className="ct-comment-thread-line" aria-hidden="true" />
                  <div className="ct-comment-preview-bubble">
                    <div className="ct-comment-preview-meta">
                      <span className="ct-comment-preview-author">@{comment.author}</span>
                      <span className="ct-comment-preview-time">{formatTime(comment.timestamp)}</span>
                    </div>
                    <div className="ct-comment-preview-content">
                      {truncateContent(comment.content, isExpanded ? 220 : 100)}
                    </div>
                    <span className="ct-comment-preview-floor">第 {commentIndex + 1} 条</span>
                  </div>
                </div>
              ))}
              {!isExpanded && hiddenCommentCount > 0 && (
                <button
                  className="ct-comment-preview-more"
                  onClick={() => onToggleExpanded(itemKey)}
                >
                  还有 {hiddenCommentCount} 条评论，点击展开
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ContentPreview: React.FC<ContentPreviewProps> = ({ data, onQuickDemo, filteredData }) => {
  const displayData = filteredData ?? data;
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const listRef = useRef<ListImperativeAPI | null>(null);

  useEffect(() => {
    const nextKeys = new Set(data.map((item) => getItemKey(item)));
    setExpandedIds((prev) => prev.filter((id) => nextKeys.has(id)));
  }, [data]);

  useEffect(() => {
    if (data.length > 0) {
      listRef.current?.scrollToRow({
        index: data.length - 1,
        align: 'end',
        behavior: 'auto',
      });
    }
  }, [data.length, listRef]);

  useEffect(() => {
    if (listRef.current) {
      (listRef.current as any).resetAfterIndex(0);
    }
  }, [expandedIds]);

  const rowProps = useMemo<PreviewRowProps>(
    () => ({
      items: displayData,
      expandedIds,
      onToggleExpanded: (id) => {
        setExpandedIds((prev) =>
          prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
        );
      },
    }),
    [displayData, expandedIds]
  );

  if (data.length === 0) {
    return (
      <div className="ct-content-preview ct-empty">
        <div className="ct-empty-state">
          <span className="ct-empty-icon">📄</span>
          <span className="ct-empty-text">暂无爬取内容</span>
          <span className="ct-empty-hint">开始爬取后，内容将在这里实时展示</span>
          {onQuickDemo && (
            <button className="ct-demo-btn" onClick={onQuickDemo}>
              快速体验（采集 5 条示例数据）
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ct-content-preview">
      <div className="ct-preview-header">
        <span className="ct-preview-title">实时预览</span>
        <span className="ct-preview-count">共 {displayData.length} 条</span>
      </div>
      <div className="ct-preview-list">
        <AutoSizer
          renderProp={({ height, width }: AutoSizerChildProps) => (
            <List
              className="ct-preview-list-virtual"
              style={{ height: height || 0, width: width || 0 }}
              rowComponent={PreviewRow}
              rowCount={displayData.length}
              rowHeight={(index) => getRowHeight(displayData[index], expandedIds.includes(getItemKey(displayData[index])))}
              rowProps={rowProps}
              listRef={listRef}
              overscanCount={6}
            />
          )}
        />
      </div>
    </div>
  );
};

export default ContentPreview;
