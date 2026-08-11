import type { Validation } from '../../types';

export function ValidationBadge({ validation }: { validation: Validation }) {
  const label = validation.level === 'green' ? 'Validada' : validation.level === 'red' ? 'Risco' : 'Conferir';
  return <span className={`validation ${validation.level}`} title={validation.issues.join(' | ')}>{label}</span>;
}

