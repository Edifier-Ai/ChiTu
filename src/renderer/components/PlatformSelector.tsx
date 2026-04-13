import React from 'react';
import { PlatformId } from '../../shared/types';
import { PLATFORM_META } from '../lib/platforms';
import './PlatformSelector.css';

interface PlatformSelectorProps {
  selected: PlatformId[];
  onChange: (platforms: PlatformId[]) => void;
  disabled?: boolean;
}

const PlatformSelector: React.FC<PlatformSelectorProps> = ({ selected, onChange, disabled }) => {
  const handleToggle = (platformId: PlatformId) => {
    if (selected.includes(platformId)) {
      onChange(selected.filter(p => p !== platformId));
    } else {
      onChange([...selected, platformId]);
    }
  };

  return (
    <div className="platform-selector">
      <label className="label">
        <span className="label-text">选择平台</span>
        <span className="label-hint">支持多选</span>
      </label>
      <div className="platform-grid">
        {PLATFORM_META.map((platform) => {
          const isSelected = selected.includes(platform.id);
          return (
            <button
              key={platform.id}
              className={`platform-card ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
              onClick={() => !disabled && handleToggle(platform.id)}
              style={{
                '--platform-color': platform.color,
              } as React.CSSProperties}
            >
              <img src={platform.icon} alt={platform.name} className="platform-icon" />
              <span className="platform-name">{platform.name}</span>
              {isSelected && <span className="check-mark">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PlatformSelector;
