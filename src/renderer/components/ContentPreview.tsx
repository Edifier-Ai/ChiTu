import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AutoSizer, AutoSizerChildProps } from 'react-virtualized-auto-sizer';
import { List, ListImperativeAPI, RowComponentProps, useDynamicRowHeight } from 'react-window';
import { CrawledItem } from '../../shared/types';
import { PLATFORM_ICON_MAP, PLATFORM_NAME_MAP } from '../lib/platforms';
import './ContentPreview.css';

interface ContentPreviewProps {
  data: CrawledItem[];
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



const PreviewRow = React.memo(function PreviewRow({ index, style, items, expandedIds, onToggleExpanded }: RowComponentProps<PreviewRowProps>) {
  const item = items[index];
  const itemKey = getItemKey(item);
  const isExpanded = expandedIds.includes(itemKey);
  const commentCount = item.comments?.length || 0;
  const visibleComments = getVisibleComments(item, isExpanded);
  const hiddenCommentCount = Math.max(commentCount - visibleComments.length, 0);

  return (
    <div style={style} className="preview-row">
      <div className="preview-item preview-item-rich" aria-label={`${item.platform}-${item.keyword}`}>
        <div className="item-header">
          <span className="item-platform">
            {PLATFORM_ICON_MAP[item.platform] ? (
              <img src={PLATFORM_ICON_MAP[item.platform]} alt={PLATFORM_NAME_MAP[item.platform] || item.platform} className="preview-platform-icon" />
            ) : (
              <span className="preview-platform-icon-fallback">📄</span>
            )}
            {PLATFORM_NAME_MAP[item.platform] || item.platform}
          </span>
          <span className="item-keyword">{item.keyword}</span>
          <span className="item-time">{formatTime(item.timestamp)}</span>
        </div>
        <div className="item-content">{truncateContent(item.content)}</div>
        <div className="item-footer">
          <span className="item-author">@{item.author}</span>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="item-link"
            >
              原文链接 →
            </a>
          )}
          {commentCount > 0 && <span className="item-comments">💬 {commentCount} 条评论</span>}
        </div>
        {commentCount > 0 && (
          <div className="comment-thread">
            <div className="comment-thread-header">
              <div className="comment-thread-title">
                <span className="comment-thread-dot" />
                评论区
              </div>
              <button
                className="item-comments item-comments-btn"
                onClick={() => onToggleExpanded(itemKey)}
              >
                {isExpanded ? '收起评论' : `展开全部 ${commentCount} 条`}
              </button>
            </div>
            <div className="comment-preview-list">
              {visibleComments.map((comment, commentIndex) => (
                <div className="comment-preview-item" key={comment.id}>
                  <div className="comment-thread-line" aria-hidden="true" />
                  <div className="comment-preview-bubble">
                    <div className="comment-preview-meta">
                      <span className="comment-preview-author">@{comment.author}</span>
                      <span className="comment-preview-time">{formatTime(comment.timestamp)}</span>
                    </div>
                    <div className="comment-preview-content">
                      {truncateContent(comment.content, isExpanded ? 220 : 100)}
                    </div>
                    <span className="comment-preview-floor">第 {commentIndex + 1} 条</span>
                  </div>
                </div>
              ))}
              {!isExpanded && hiddenCommentCount > 0 && (
                <button
                  className="comment-preview-more"
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
});

const ContentPreview: React.FC<ContentPreviewProps> = ({ data }) => {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const listRef = useRef<ListImperativeAPI | null>(null);
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 152 });

  // Remove O(N) array filtering on every data update to prevent lag
  // The expandedIds will just contain some stale IDs which doesn't affect rendering
  
  useEffect(() => {
    if (data.length > 0) {
      listRef.current?.scrollToRow({
        index: data.length - 1,
        align: 'end',
        behavior: 'auto',
      });
    }
  }, [data.length]);

  const rowProps = useMemo<PreviewRowProps>(
    () => ({
      items: data,
      expandedIds,
      onToggleExpanded: (id) => {
        setExpandedIds((prev) =>
          prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
        );
      },
    }),
    [data, expandedIds]
  );

  if (data.length === 0) {
    return (
      <div className="content-preview empty">
        <div className="empty-state">
          <span className="empty-icon">📄</span>
          <span className="empty-text">暂无爬取内容</span>
          <span className="empty-hint">开始爬取后，内容将在这里实时展示</span>
        </div>
      </div>
    );
  }

  return (
    <div className="content-preview">
      <div className="preview-header">
        <span className="preview-title">实时预览</span>
        <span className="preview-count">共 {data.length} 条</span>
      </div>
      <div className="preview-list">
        <AutoSizer
          renderProp={({ height, width }: AutoSizerChildProps) => (
            <List
              className="preview-list-virtual"
              style={{ height: height || 0, width: width || 0 }}
              rowComponent={PreviewRow as any}
              rowCount={data.length}
              rowHeight={rowHeight}
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
