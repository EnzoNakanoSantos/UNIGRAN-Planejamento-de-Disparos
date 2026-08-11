import type { FormEvent } from 'react';
import { useState } from 'react';

export function Login({ error, onLogin }: {
  error: string;
  onLogin: (email: string, password: string, keepConnected: boolean) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepConnected, setKeepConnected] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onLogin(email, password, keepConnected);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authPage">
      <form className="authCard" onSubmit={submit}>
        <img className="authLogo" src="/unigran-logo.png" alt="UNIGRAN" />
        <div>
          <h1>Entrar no planejamento</h1>
          <p>Acesso restrito aos e-mails autorizados do setor.</p>
        </div>
        {error && <div className="authError">{error}</div>}
        <label className="field">
          <span>E-mail</span>
          <input
            autoFocus
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
        </label>
        <label className="rememberLogin">
          <input
            type="checkbox"
            checked={keepConnected}
            onChange={event => setKeepConnected(event.target.checked)}
          />
          Manter conectado neste navegador
        </label>
        <button className="btn primary authButton" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </main>
  );
}

