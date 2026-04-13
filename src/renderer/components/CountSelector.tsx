import React, { useState } from 'react';
import './CountSelector.css';

interface CountSelectorProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const presetValues = [10, 50, 100, 200, 500, 1000];

const CountSelector: React.FC<CountSelectorProps> = ({ value, onChange, disabled }) => {
  const [showInput, setShowInput] = useState(false);
  const [customValue, setCustomValue] = useState(value.toString());

  const handlePresetClick = (preset: number) => {
    onChange(preset);
    setCustomValue(preset.toString());
    setShowInput(false);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 0;
    setCustomValue(e.target.value);
    if (val >= 10 && val <= 1000) {
      onChange(val);
    }
  };

  const handleCustomBlur = () => {
    const val = parseInt(customValue) || 100;
    const clamped = Math.max(10, Math.min(1000, val));
    onChange(clamped);
    setCustomValue(clamped.toString());
    setShowInput(false);
  };

  return (
    <div className="count-selector">
      <label className="label">
        <span className="label-text">爬取数量</span>
        <span className="label-hint">每个平台的条数限制</span>
      </label>

      {showInput && !disabled ? (
        <div className="custom-input-wrapper">
          <input
            type="number"
            value={customValue}
            onChange={handleCustomChange}
            onBlur={handleCustomBlur}
            min={10}
            max={1000}
            className="custom-count-input"
            autoFocus
          />
          <span className="range-hint">10 - 1000</span>
        </div>
      ) : (
        <>
          <div className="preset-buttons">
            {presetValues.map((preset) => (
              <button
                key={preset}
                className={`preset-btn ${value === preset ? 'active' : ''}`}
                onClick={() => handlePresetClick(preset)}
                disabled={disabled}
              >
                {preset}
              </button>
            ))}
          </div>
          <button
            className="custom-btn"
            onClick={() => setShowInput(true)}
            disabled={disabled}
          >
            自定义
          </button>
        </>
      )}

      <div className="slider-wrapper">
        <input
          type="range"
          min={10}
          max={1000}
          step={10}
          value={value}
          onChange={(e) => {
            onChange(parseInt(e.target.value));
            setCustomValue(e.target.value);
          }}
          disabled={disabled}
          className="count-slider"
        />
        <div className="slider-value">
          <span className="value">{value}</span>
          <span className="unit">条</span>
        </div>
      </div>
    </div>
  );
};

export default CountSelector;
