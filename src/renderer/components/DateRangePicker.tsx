import React, { useState } from 'react';
import './DateRangePicker.css';

interface DateRangePickerProps {
  startDate: string | null;
  endDate: string | null;
  onStartDateChange: (date: string | null) => void;
  onEndDateChange: (date: string | null) => void;
  disabled?: boolean;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  disabled,
}) => {
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '不限';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  const getToday = () => {
    return new Date().toISOString().split('T')[0];
  };

  return (
    <div className="ct-date-range-picker">
      <label className="label">
        <span className="label-text">时间范围</span>
        <span className="label-hint">选择爬取内容的时间区间</span>
      </label>
      <div className="ct-date-inputs">
        <div className="ct-date-input-wrapper">
          <span className="ct-date-label">起始</span>
          {showStartPicker && !disabled ? (
            <input
              type="date"
              value={startDate || ''}
              onChange={(e) => onStartDateChange(e.target.value || null)}
              onBlur={() => setShowStartPicker(false)}
              className="ct-date-input"
              max={getToday()}
              autoFocus
            />
          ) : (
            <button
              className="ct-date-display"
              onClick={() => !disabled && setShowStartPicker(true)}
            >
              {formatDate(startDate)}
            </button>
          )}
        </div>
        <span className="ct-separator">至</span>
        <div className="ct-date-input-wrapper">
          <span className="ct-date-label">结束</span>
          {showEndPicker && !disabled ? (
            <input
              type="date"
              value={endDate || ''}
              onChange={(e) => onEndDateChange(e.target.value || null)}
              onBlur={() => setShowEndPicker(false)}
              className="ct-date-input"
              max={getToday()}
              autoFocus
            />
          ) : (
            <button
              className="ct-date-display"
              onClick={() => !disabled && setShowEndPicker(true)}
            >
              {formatDate(endDate)}
            </button>
          )}
        </div>
      </div>
      {(startDate || endDate) && (
        <button
          className="ct-clear-dates"
          onClick={() => {
            onStartDateChange(null);
            onEndDateChange(null);
          }}
          disabled={disabled}
        >
          清除时间限制
        </button>
      )}
    </div>
  );
};

export default DateRangePicker;
