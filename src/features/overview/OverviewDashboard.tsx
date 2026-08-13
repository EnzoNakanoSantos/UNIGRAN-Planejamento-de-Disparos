import type { BaseRule, Dispatch, Tab } from '../../types';
import { addDaysISO, dispatchValidation, fmtDate, todayISO } from '../../logic';
import { channelName, dispatchDisplayName } from '../../utils/app';

export function OverviewDashboard({ dispatches, bases, userName, onNavigate, onNew, onView }: {
  dispatches: Dispatch[];
  bases: BaseRule[];
  userName: string;
  onNavigate: (tab: Tab) => void;
  onNew: () => void;
  onView: (dispatch: Dispatch) => void;
}) {
  const today = todayISO();
  const end = addDaysISO(today, 15);
  const upcoming = dispatches
    .filter(item => item.date >= today && item.date <= end && item.status !== 'Cancelado')
    .sort((a, b) => `${a.date} ${a.time || '00:00'}`.localeCompare(`${b.date} ${b.time || '00:00'}`));
  const attention = dispatches
    .map(dispatch => ({ dispatch, validation: dispatchValidation(dispatch, bases) }))
    .filter(item => item.validation.level !== 'green')
    .slice(0, 4);
  const ready = dispatches.filter(item => item.status === 'Pronto para disparo').length;
  const sentThisMonth = dispatches.filter(item => item.status === 'Enviado' && item.date.startsWith(today.slice(0, 7))).length;
  const channelCounts = {
    email: upcoming.filter(item => (item.channel || 'email') === 'email').length,
    whatsapp: upcoming.filter(item => item.channel === 'whatsapp').length,
    html_email: upcoming.filter(item => item.channel === 'html_email').length
  };
  const maxChannelCount = Math.max(1, ...Object.values(channelCounts));
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    .format(new Date(`${today}T12:00:00`))
    .replace('.', '')
    .toUpperCase();

  return (
    <section className="overviewView">
      <div className="overviewHero">
        <div>
          <span className="overviewDate">{dateLabel}</span>
          <h2>Olá, {userName || 'bem-vindo'}.</h2>
          <p>Você tem <strong>{attention.length} item(ns) que precisam de atenção</strong> antes dos próximos disparos.</p>
        </div>
        <div className="overviewHeroActions">
          <button className="btn ghost" onClick={() => onNavigate('calendar')}>Ver calendário</button>
          <button className="btn primary" onClick={onNew}>＋ Planejar disparo</button>
        </div>
      </div>

      <div className="overviewMetrics">
        <button onClick={() => onNavigate('email')}><i className="blue">↗</i><span>Próximos disparos<strong>{upcoming.length}</strong><small>nos próximos 15 dias</small></span></button>
        <button onClick={() => onNavigate('email')}><i className="amber">!</i><span>Precisam de atenção<strong>{attention.length}</strong><small>pendências de validação</small></span></button>
        <button onClick={() => onNavigate('email')}><i className="green">✓</i><span>Prontos<strong>{ready}</strong><small>aguardando execução</small></span></button>
        <button onClick={() => onNavigate('email')}><i className="violet">✓✓</i><span>Enviados este mês<strong>{sentThisMonth}</strong><small>todos os canais</small></span></button>
      </div>

      <div className="overviewColumns">
        <article className="overviewPanel">
          <header><div><span>PRIORIDADE</span><h3>Atenção necessária</h3></div><button onClick={() => onNavigate('email')}>Ver todos →</button></header>
          <div className="overviewIssues">
            {!attention.length && <div className="overviewEmpty">Nenhuma pendência encontrada.</div>}
            {attention.map(({ dispatch, validation }) => (
              <button className={`overviewIssue ${validation.level}`} key={dispatch.id} onClick={() => onView(dispatch)}>
                <i>{validation.level === 'red' ? '!' : '↺'}</i>
                <span><strong>{dispatchDisplayName(dispatch) || 'Disparo sem nome'}</strong><em>{validation.issues[0] || 'Conferir cadastro'}</em><small>{channelName(dispatch.channel || 'email')} • {fmtDate(dispatch.date)}{dispatch.time ? `, ${dispatch.time}` : ''}</small></span>
                <b>Corrigir</b>
              </button>
            ))}
          </div>
        </article>

        <article className="overviewPanel">
          <header><div><span>AGENDA</span><h3>Próximos disparos</h3></div><button onClick={() => onNavigate('calendar')}>Calendário →</button></header>
          <div className="overviewTimeline">
            {!upcoming.length && <div className="overviewEmpty">Nenhum disparo nos próximos 15 dias.</div>}
            {upcoming.slice(0, 6).map(dispatch => (
              <button key={dispatch.id} onClick={() => onView(dispatch)}>
                <time>{fmtDate(dispatch.date).slice(0, 5)}<small>{dispatch.time || '--:--'}</small></time>
                <span className={`overviewChannel ${dispatch.channel || 'email'}`}>{channelName(dispatch.channel || 'email')}</span>
                <strong>{dispatchDisplayName(dispatch) || 'Disparo sem nome'}</strong>
                <em className={`status ${dispatch.status.toLowerCase().replace(/\s+/g, '-')}`}>● {dispatch.status}</em>
              </button>
            ))}
          </div>
        </article>
      </div>

      <article className="overviewPanel overviewDistribution">
        <header><div><span>VISÃO OPERACIONAL</span><h3>Distribuição dos próximos 15 dias</h3></div><small>Dados atuais</small></header>
        {([
          ['E-mail', 'email', channelCounts.email],
          ['WhatsApp', 'whatsapp', channelCounts.whatsapp],
          ['E-mail HTML', 'html_email', channelCounts.html_email]
        ] as const).map(([label, channel, count]) => (
          <div className="overviewBar" key={channel}><span>{label}</span><div><i className={channel} style={{ width: `${(count / maxChannelCount) * 100}%` }} /></div><strong>{count}</strong></div>
        ))}
      </article>
    </section>
  );
}
