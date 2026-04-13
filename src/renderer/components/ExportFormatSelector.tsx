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
    <div className="export-format-selector">
      <label className="format-label">导出格式</label>
      <div className="format-options">
        <label className={`format-option ${value === 'excel' ? 'active' : ''}`}>
          <input
            type="radio"
            name="exportFormat"
            value="excel"
            checked={value === 'excel'}
            onChange={(e) => onChange(e.target.value as ExportFormat)}
            disabled={disabled}
          />
          <span className="format-name">Excel (.xlsx)</span>
        </label>
        <label className={`format-option ${value === 'csv' ? 'active' : ''}`}>
          <input
            type="radio"
            name="exportFormat"
            value="csv"
            checked={value === 'csv'}
            onChange={(e) => onChange(e.target.value as ExportFormat)}
            disabled={disabled}
          />
          <span className="format-name">CSV</span>
        </label>
      </div>
    </div>
  );
};

export default ExportFormatSelector;
