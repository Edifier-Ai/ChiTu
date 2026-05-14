import React, { useState } from 'react';
import './KeywordInput.css';

interface KeywordInputProps {
  keywords: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  onKeywordsChange: (keywords: string[]) => void;
  onIncludeKeywordsChange: (keywords: string[]) => void;
  onExcludeKeywordsChange: (keywords: string[]) => void;
  disabled?: boolean;
}

type KeywordSectionType = 'search' | 'include' | 'exclude';

interface KeywordSectionConfig {
  key: KeywordSectionType;
  title: string;
  hint: string;
  placeholder: string;
  emptyText: string;
  values: string[];
  onChange: (keywords: string[]) => void;
  toneClassName?: string;
}

const KeywordInput: React.FC<KeywordInputProps> = ({
  keywords,
  includeKeywords,
  excludeKeywords,
  onKeywordsChange,
  onIncludeKeywordsChange,
  onExcludeKeywordsChange,
  disabled,
}) => {
  const [inputValues, setInputValues] = useState<Record<KeywordSectionType, string>>({
    search: '',
    include: '',
    exclude: '',
  });

  const sections: KeywordSectionConfig[] = [
    {
      key: 'search',
      title: '搜索关键词',
      hint: '决定去平台搜什么，支持多个',
      placeholder: '输入搜索词，如：AI、追觅手机',
      emptyText: '暂无搜索关键词，请添加',
      values: keywords,
      onChange: onKeywordsChange,
    },
    {
      key: 'include',
      title: '内容必须包含',
      hint: '只保留正文里包含这些词的内容',
      placeholder: '输入必须包含的词，如：发布会、真机',
      emptyText: '未设置包含词，将不过滤正文中的包含条件',
      values: includeKeywords,
      onChange: onIncludeKeywordsChange,
      toneClassName: 'ct-include-tone',
    },
    {
      key: 'exclude',
      title: '内容不得包含',
      hint: '过滤掉正文里含这些词的内容',
      placeholder: '输入排除词，如：二手、转让',
      emptyText: '未设置排除词，将不过滤正文中的排除条件',
      values: excludeKeywords,
      onChange: onExcludeKeywordsChange,
      toneClassName: 'ct-exclude-tone',
    },
  ];

  const setSectionInput = (section: KeywordSectionType, value: string) => {
    setInputValues((prev) => ({
      ...prev,
      [section]: value,
    }));
  };

  const handleAdd = (section: KeywordSectionConfig) => {
    const trimmed = inputValues[section.key].trim();
    if (trimmed && !section.values.includes(trimmed)) {
      section.onChange([...section.values, trimmed]);
      setSectionInput(section.key, '');
    }
  };

  const handleKeyPress = (section: KeywordSectionConfig, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd(section);
    }
  };

  const handleRemove = (section: KeywordSectionConfig, keyword: string) => {
    section.onChange(section.values.filter((item) => item !== keyword));
  };

  return (
    <div className="ct-keyword-input">
      {sections.map((section) => (
        <div key={section.key} className={`ct-keyword-section ${section.toneClassName || ''}`}>
          <label className="ct-label">
            <span className="ct-label-text">{section.title}</span>
            <span className="ct-label-hint">{section.hint}</span>
          </label>
          <div className="ct-input-wrapper">
            <input
              type="text"
              value={inputValues[section.key]}
              onChange={(e) => setSectionInput(section.key, e.target.value)}
              onKeyDown={(e) => handleKeyPress(section, e)}
              placeholder={section.placeholder}
              className="ct-keyword-text-input"
              disabled={disabled}
            />
            <button
              onClick={() => handleAdd(section)}
              disabled={disabled || !inputValues[section.key].trim()}
              className="ct-add-btn"
            >
              添加
            </button>
          </div>
          {section.values.length > 0 ? (
            <div className="ct-keyword-ct-tags">
              {section.values.map((keyword) => (
                <span key={`${section.key}-${keyword}`} className={`ct-tag ${section.toneClassName || ''}`}>
                  {keyword}
                  <button
                    onClick={() => handleRemove(section, keyword)}
                    disabled={disabled}
                    className="ct-remove-ct-tag"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="ct-empty-keywords">
              <span>{section.emptyText}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default KeywordInput;
