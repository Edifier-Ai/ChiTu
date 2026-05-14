import React from 'react';
import { ExportFormat } from '../../shared/types';
import './ExportFormatSelector.css';

interface ExportFormatSelectorProps {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
  disabled?: boolean;
}

const ExportFormatSelector: React.FC<ExportFormatSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="ct-export-format-selector">
      <label className="ct-format-label">导出格式</label>
      <div className="ct-format-options">
        <label className={`ct-format-option ${value === 'excel' ? 'ct-active' : ''}`}>
          <input
            type="radio"
            name="exportFormat"
            value="excel"
            checked={value === 'excel'}
            onChange={(e) => onChange(e.target.value as ExportFormat)}
            disabled={disabled}
          />
          <span className="ct-format-name">Excel (.xlsx)</span>
        </label>
        <label className={`ct-format-option ${value === 'csv' ? 'ct-active' : ''}`}>
          <input
            type="radio"
            name="exportFormat"
            value="csv"
            checked={value === 'csv'}
            onChange={(e) => onChange(e.target.value as ExportFormat)}
            disabled={disabled}
          />
          <span className="ct-format-name">CSV</span>
        </label>
      </div>
    </div>
  );
};

export default ExportFormatSelector;
