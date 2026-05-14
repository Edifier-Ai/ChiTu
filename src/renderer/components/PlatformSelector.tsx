import React from 'react';
import { PlatformId } from '../../shared/types';
import { PLATFORM_META } from '../lib/platforms';
import './PlatformSelector.css';

interface PlatformSelectorProps {
  selected: PlatformId[];
  onChange: (platforms: PlatformId[]) => void;
  disabled?: boolean;
  allowedPlatforms?: PlatformId[];
}

const PlatformSelector: React.FC<PlatformSelectorProps> = ({ selected, onChange, disabled, allowedPlatforms }) => {
  const handleToggle = (platformId: PlatformId) => {
    if (selected.includes(platformId)) {
      onChange(selected.filter(p => p !== platformId));
    } else {
      onChange([...selected, platformId]);
    }
  };

  return (
    <div className="ct-platform-selector">
      <label className="label">
        <span className="label-text">选择平台</span>
        <span className="label-hint">支持多选</span>
      </label>
      <div className="ct-platform-grid">
        {PLATFORM_META.filter((platform) => !allowedPlatforms || allowedPlatforms.includes(platform.id)).map((platform) => {
          const isSelected = selected.includes(platform.id);
          return (
            <button
              key={platform.id}
              className={`ct-platform-card ${isSelected ? 'ct-selected' : ''} ${disabled ? 'ct-disabled' : ''}`}
              onClick={() => !disabled && handleToggle(platform.id)}
              style={{
                '--platform-color': platform.color,
              } as React.CSSProperties}
            >
              <span className="ct-platform-icon">{platform.icon}</span>
              <span className="ct-platform-name">{platform.name}</span>
              {isSelected && <span className="ct-check-mark">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PlatformSelector;
