import { useState } from 'react';

export function OpsSearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/** Desktop filter row (Line / Slaughter style) */
export function OpsFilterBar({ children, className = '' }) {
  return <div className={`ops-filter-desktop ${className}`.trim()}>{children}</div>;
}

export function OpsFilterSearch({ value, onChange, placeholder = 'Search…', className = '', inputRef }) {
  return (
    <div className={`ops-filter-search-wrap ${className}`.trim()}>
      <OpsSearchIcon />
      <input
        ref={inputRef}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
      />
    </div>
  );
}

export function OpsFilterInput({ value, onChange, placeholder, className = '', style, type = 'text' }) {
  return (
    <input
      type={type}
      className={`ops-filter-input ${className}`.trim()}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={style}
    />
  );
}

export function OpsFilterSelect({ value, onChange, children, ariaLabel, className = '' }) {
  return (
    <select
      className={`ops-filter-select ${className}`.trim()}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    >
      {children}
    </select>
  );
}

export function OpsFilterField({ children, className = '', style }) {
  return (
    <div className={`ops-filter-field ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

export function OpsFilterActions({ children, className = '' }) {
  return <div className={`ops-filter-actions ${className}`.trim()}>{children}</div>;
}

export function OpsFilterBtn({ children, onClick, type = 'button', variant = 'default', disabled, className = '' }) {
  const v =
    variant === 'primary'
      ? 'ops-filter-btn-primary'
      : variant === 'danger'
        ? 'ops-filter-btn-danger'
        : 'ops-filter-btn';
  return (
    <button type={type} className={`${v} ${className}`.trim()} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function OpsFilterToggleRow({ children, className = '' }) {
  return <div className={`ops-filter-toggle ${className}`.trim()}>{children}</div>;
}

export function OpsFilterToggleBtn({ open, onClick, label = 'Filters' }) {
  return (
    <button
      type="button"
      className={`ops-filter-toggle-btn${open ? ' is-open' : ''}`}
      onClick={onClick}
      aria-expanded={open}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden style={{ marginRight: 6, verticalAlign: -2 }}>
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="14" y2="18" />
      </svg>
      {label}
    </button>
  );
}

export function OpsFilterMobile({ open, children, onDone, onReset, className = '' }) {
  if (!open) return <div className={`ops-filter-mobile ${className}`.trim()} />;
  return (
    <div className={`ops-filter-mobile ${className}`.trim()}>
      <div className="ops-filter-mobile-panel">
        {children}
        <div className="ops-filter-mobile-actions">
          <button type="button" className="ops-filter-mobile-done" onClick={onDone}>Done</button>
          {onReset && (
            <button type="button" className="ops-filter-mobile-reset" onClick={onReset}>Reset</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OpsMultiSelectDropdown({
  label,
  options = [],
  values = [],
  onChange,
  placeholder = 'All',
  width,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const selectedValues = Array.isArray(values) ? values : [];
  const selectedCount = selectedValues.length;
  const toggleValue = (value) => {
    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value]
    );
  };

  return (
    <div
      className={`ops-filter-multiselect ${className}`.trim()}
      style={width != null ? { width, minWidth: width } : undefined}
    >
      {label ? <span className="ops-filter-multiselect-label">{label}</span> : null}
      <button
        type="button"
        className={`ops-filter-multiselect-btn${open ? ' is-open' : ''}${selectedCount ? ' has-value' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selectedCount ? `${selectedCount} selected` : placeholder}</span>
        <span className="ops-filter-multiselect-caret">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="ops-filter-multiselect-menu">
          {selectedCount > 0 && (
            <button type="button" className="ops-filter-multiselect-clear" onClick={() => onChange([])}>
              Clear selection
            </button>
          )}
          {options.length === 0 ? (
            <div className="ops-filter-multiselect-empty">No options available</div>
          ) : (
            options.map((opt) => {
              const isSelected = selectedValues.includes(opt.value);
              return (
                <label key={opt.value} className={`ops-filter-multiselect-option${isSelected ? ' is-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleValue(opt.value)}
                  />
                  {opt.label}
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
