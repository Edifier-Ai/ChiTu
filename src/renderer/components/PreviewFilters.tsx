import React from 'react';
import { PlatformId } from '../../shared/types';
import { PLATFORM_META } from '../lib/platforms';
import './PreviewFilters.css';

interface PreviewFiltersProps {
  keywordFilter: string;
  onKeywordFilterChange: (value: string) => void;
  authorFilter: string;
  onAuthorFilterChange: (value: string) => void;
  platformFilter: PlatformId | null;
  onPlatformFilterChange: (value: PlatformId | null) => void;
}

const PreviewFilters: React.FC<PreviewFiltersProps> = ({
  keywordFilter,
  onKeywordFilterChange,
  authorFilter,
  onAuthorFilterChange,
  platformFilter,
  onPlatformFilterChange,
}) => {
  return (
    <div className="ct-preview-filters">
      <input
        className="ct-preview-filter-input"
        type="text"
        placeholder="筛选内容关键词..."
        value={keywordFilter}
        onChange={(e) => onKeywordFilterChange(e.target.value)}
      />
      <input
        className="ct-preview-filter-input"
        type="text"
        placeholder="筛选作者..."
        value={authorFilter}
        onChange={(e) => onAuthorFilterChange(e.target.value)}
      />
      <select
        className="ct-preview-filter-select"
        value={platformFilter || ''}
        onChange={(e) => onPlatformFilterChange((e.target.value as PlatformId) || null)}
      >
        <option value="">全部平台</option>
        {PLATFORM_META.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default PreviewFilters;
