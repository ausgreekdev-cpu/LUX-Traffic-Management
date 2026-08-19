// Shared validated field primitives for the settings hub. Every field renders a
// labelled control with a hint, and optionally shows inline validation.

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block mb-3 ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {error && <span className="text-xs text-red-600 dark:text-red-400 mt-1 block">{error}</span>}
      {!error && hint && <span className="text-xs text-gray-400 mt-1 block">{hint}</span>}
    </label>
  );
}

const inputCls = (error) => `input w-full ${error ? 'border-red-500 dark:border-red-500' : ''}`;

export function TextField({ value, onChange, placeholder, error, ...rest }) {
  return <input type="text" className={inputCls(error)} value={value || ''} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function PasswordField({ value, onChange, placeholder, hint, error, reveal, onToggleReveal }) {
  return (
    <div>
      <div className="flex gap-2">
        <input type={reveal ? 'text' : 'password'} className={inputCls(error) + ' font-mono'}
          value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={onToggleReveal} className="btn btn-ghost shrink-0">{reveal ? 'Hide' : 'Show'}</button>
      </div>
      {hint && !error && <span className="text-xs text-gray-400 mt-1 block">{hint}</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400 mt-1 block">{error}</span>}
    </div>
  );
}

export function NumberField({ value, onChange, min, max, step, placeholder, error, className = '' }) {
  return (
    <input type="number" className={(inputCls(error) + ' ' + className).trim()} min={min} max={max} step={step}
      value={value === null || value === undefined ? '' : value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? (min === 0 || min === undefined ? 0 : null) : Number(e.target.value))} />
  );
}

export function SelectField({ value, onChange, options, placeholder, error }) {
  return (
    <select className={inputCls(error)} value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function ToggleField({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-start gap-2.5 text-sm cursor-pointer mb-3">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5" />
      <span>
        {label}
        {hint && <span className="block text-xs text-gray-400 font-normal mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

export function ColorField({ value, onChange, error }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)} className="h-9 w-12 rounded border border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer" />
      <input type="text" className={inputCls(error) + ' font-mono text-xs'} value={value || ''}
        placeholder="#RRGGBB" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}