import { useEffect, useRef, useState } from 'react';
import type { RecordProperties } from '../../api/recordTypes';
import { choicesFor, parseValue, type FieldSpec } from './config';
function StructuredInput({
  spec,
  value,
  label,
  disabled,
  onChange
}: {
  spec: FieldSpec;
  value: unknown;
  label: string;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const format = (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v ?? '');
  const [raw, setRaw] = useState(format(value));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current) setRaw(format(value));
  }, [value]);
  return <input ref={input} aria-label={label} disabled={disabled} type={spec.type === 'number' ? 'number' : 'text'} value={raw} min={spec.type === 'number' ? 0 : undefined} max={spec.type === 'number' ? 10 : undefined} step={spec.type === 'number' ? '0.1' : undefined} maxLength={10000} onChange={e => {
    setRaw(e.target.value);
    const parsed = parseValue(spec, e.target.value);
    if (spec.type !== 'number' || parsed === null || Number.isFinite(parsed)) onChange(parsed);
  }} onBlur={() => setRaw(format(value))} />;
}
export function PropertyInput({
  spec,
  properties,
  value,
  onChange,
  label = spec.label,
  disabled = false
}: {
  spec: FieldSpec;
  properties: RecordProperties;
  value: unknown;
  onChange: (value: unknown) => void;
  label?: string;
  disabled?: boolean;
}) {
  const common = {
    'aria-label': label,
    disabled
  };
  if (spec.type === 'boolean') return <input {...common} type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} />;
  if (spec.type === 'select') return <select {...common} className={`status-editor value-${String(value).toLowerCase().replaceAll(' ', '-')}`} value={String(value ?? '')} onChange={e => onChange(parseValue(spec, e.target.value))}>{spec.nullable ? <option value="">Not specified</option> : null}{choicesFor(spec, properties)?.map(choice => <option key={choice} value={choice}>{choice}</option>)}</select>;
  if (spec.type === 'tags' || spec.type === 'number') return <StructuredInput spec={spec} value={value} label={label} disabled={disabled} onChange={onChange} />;
  const text = String(value ?? '');
  if (spec.type === 'textarea') return <textarea {...common} value={text} maxLength={20000} rows={2} onChange={e => onChange(parseValue(spec, e.target.value))} />;
  return <input {...common} type={spec.type === 'date' ? 'date' : 'text'} value={text} maxLength={['url_route', 'hostname_url', 'source_reference'].includes(spec.key) ? 2000 : spec.key === 'approval_reference' ? 1000 : spec.key === 'cvss_vector' ? 500 : 300} onChange={e => onChange(parseValue(spec, e.target.value))} />;
}
