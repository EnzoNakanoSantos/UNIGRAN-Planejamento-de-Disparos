import { useEffect, useRef, useState } from 'react';
import type { DispatchStatus } from '../../types';
import { STATUS } from '../../types';
import { statusClass } from '../../utils/app';

export function Metric({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function brazilianDateText(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function maskBrazilianDate(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseBrazilianDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const [, day, month, year] = match;
  const candidate = `${year}-${month}-${day}`;
  const parsed = new Date(`${candidate}T12:00:00`);
  return parsed.getFullYear() === Number(year) &&
    parsed.getMonth() + 1 === Number(month) &&
    parsed.getDate() === Number(day)
    ? candidate
    : '';
}

export function BrazilianDatePicker({ value, required = false, onChange }: {
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const textRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(brazilianDateText(value));

  useEffect(() => {
    if (document.activeElement !== textRef.current) setDraft(brazilianDateText(value));
  }, [value]);

  function updateText(rawValue: string) {
    const masked = maskBrazilianDate(rawValue);
    const parsed = parseBrazilianDate(masked);
    setDraft(masked);
    onChange(parsed);
    textRef.current?.setCustomValidity(
      masked.length === 10 && !parsed ? 'Informe uma data válida no formato dd/mm/aaaa.' : ''
    );
  }

  function validateText() {
    const parsed = parseBrazilianDate(draft);
    textRef.current?.setCustomValidity(
      parsed || (!required && !draft) ? '' : 'Informe uma data válida no formato dd/mm/aaaa.'
    );
  }

  function openCalendar() {
    const picker = nativeRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.click();
    }
  }

  return (
    <div className="localizedDatePicker">
      <input
        ref={textRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
        placeholder="dd/mm/aaaa"
        aria-label="Data no formato dia, mês e ano"
        value={draft}
        onChange={event => updateText(event.target.value)}
        onBlur={validateText}
      />
      <button type="button" className="datePickerButton" onClick={openCalendar} aria-label="Abrir calendário">
        <span aria-hidden="true">▦</span>
      </button>
      <input
        ref={nativeRef}
        className="nativeDatePicker"
        type="date"
        lang="pt-BR"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={event => {
          const next = event.target.value;
          setDraft(brazilianDateText(next));
          onChange(next);
          textRef.current?.setCustomValidity('');
        }}
      />
    </div>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

export function TwentyFourHourPicker({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const match = value.match(/^(\d{2}):(\d{2})/);
  const hour = match?.[1] || '';
  const minute = match?.[2] || '';

  function update(hourValue: string, minuteValue: string) {
    if (!hourValue && !minuteValue) {
      onChange('');
      return;
    }
    onChange(`${hourValue || '00'}:${minuteValue || '00'}`);
  }

  return (
    <div className="twentyFourHourPicker" aria-label="Horário em formato de 24 horas">
      <select aria-label="Hora" value={hour} onChange={event => update(event.target.value, minute)}>
        <option value="">Hora</option>
        {HOUR_OPTIONS.map(option => <option value={option} key={option}>{option}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label="Minuto" value={minute} onChange={event => update(hour, event.target.value)}>
        <option value="">Min</option>
        {MINUTE_OPTIONS.map(option => <option value={option} key={option}>{option}</option>)}
      </select>
    </div>
  );
}

export function Select({ value, values, placeholder = 'Todos', labels, required = false, showPlaceholder = true, onChange }: {
  value: string;
  values: readonly string[];
  placeholder?: string;
  labels?: Map<string, string>;
  required?: boolean;
  showPlaceholder?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} required={required} onChange={event => onChange(event.target.value)}>
      {showPlaceholder !== false && <option value="">{placeholder}</option>}
      {values.map(item => <option key={item} value={item}>{labels?.get(item) || item}</option>)}
    </select>
  );
}

export function StatusSelect({ value, onChange }: {
  value: DispatchStatus;
  onChange: (value: DispatchStatus) => void;
}) {
  return (
    <select className={`statusSelect ${statusClass(value)}`} value={value} onChange={event => onChange(event.target.value as DispatchStatus)}>
      {STATUS.map(item => <option key={item} value={item}>{item}</option>)}
    </select>
  );
}

export function SelectWithCreate({ value, values, placeholder, createLabel, createPlaceholder = 'Novo cadastro', required = false, onChange, onCreate }: {
  value: string;
  values: readonly string[];
  placeholder: string;
  createLabel: string;
  createPlaceholder?: string;
  required?: boolean;
  onChange: (value: string) => void;
  onCreate: (value: string) => Promise<void> | void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitCreate() {
    const clean = draft.trim();
    if (!clean) return;
    setBusy(true);
    try {
      await onCreate(clean);
      setDraft('');
      setCreating(false);
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <div className="selectCreate">
        <input
          autoFocus
          required
          value={draft}
          placeholder={createPlaceholder}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitCreate();
            }
          }}
        />
        <button type="button" className="btn primary small" disabled={busy || !draft.trim()} onClick={submitCreate}>{busy ? 'Salvando...' : 'Salvar'}</button>
        <button type="button" className="btn ghost small" onClick={() => setCreating(false)}>Cancelar</button>
      </div>
    );
  }

  return (
    <div className="selectCreate">
      <Select required={required} value={value} values={values} placeholder={placeholder} onChange={onChange} />
      <button type="button" className="btn ghost small" onClick={() => setCreating(true)}>{createLabel}</button>
    </div>
  );
}

