import { AlertTriangle, Calendar, CheckCircle2, Clock, Plus, RotateCcw, Send } from 'lucide-react';
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
  const sent = dispatches.filter(item => item.status === 'Enviado').length;
  const channelCounts = {
    email: upcoming.filter(item => (item.channel || 'email') === 'email').length,
    whatsapp: upcoming.filter(item => item.channel === 'whatsapp').length,
    html_email: upcoming.filter(item => item.channel === 'html_email').length
  };
  const maxChannelCount = Math.max(1, ...Object.values(channelCounts));
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    .format(new Date(`${today}T12:00:00`))
    .replace(/^./, char => char.toUpperCase());

  return (
    <section className="overviewView">
      <div className="overviewHero">
        <div>
          <span className="overviewDate"><Calendar /> {dateLabel}</span>
          <h2>Painel de Disparos UNIGRAN</h2>
          <p>{attention.length > 0 ? <>Você possui <strong>{attention.length} item(ns) com pendência de validação</strong> antes dos próximos envios programados.</> : 'Todos os disparos programados estão em dia e validados.'}</p>
        </div>
        <div className="overviewHeroActions">
          <button className="overviewCalendarButton" onClick={() => onNavigate('calendar')}><Calendar /> <span>Ver Calendário</span></button>
          <button className="overviewPlanButton" onClick={onNew}><Plus /> <span>Planejar Disparo</span></button>
        </div>
      </div>

      <div className="overviewMetrics">
        <button onClick={() => onNavigate('email')}><i className="blue"><Clock /></i><span>Próximos Disparos<strong>{upcoming.length}</strong><small>nos próximos 15 dias</small></span></button>
        <button onClick={() => onNavigate('email')}><i className="amber"><AlertTriangle /></i><span>Precisam de Atenção<strong>{attention.length}</strong><small>alertas detectados</small></span></button>
        <button onClick={() => onNavigate('email')}><i className="green"><CheckCircle2 /></i><span>Prontos para Envio<strong>{ready}</strong><small>validados 100%</small></span></button>
        <button onClick={() => onNavigate('email')}><i className="violet"><Send /></i><span>Disparos Enviados<strong>{sent}</strong><small>histórico recente</small></span></button>
      </div>

      <div className="overviewColumns">
        <article className="overviewPanel">
          <header><div><span>PRIORIDADE</span><h3>Atenção Necessária</h3></div><button onClick={() => onNavigate('email')}>Ver tabela →</button></header>
          <div className="overviewIssues">
            {!attention.length && <div className="overviewEmpty">Nenhuma pendência encontrada.</div>}
            {attention.map(({ dispatch, validation }) => (
              <button className={`overviewIssue ${validation.level}`} key={dispatch.id} onClick={() => onView(dispatch)}>
                <i>{validation.level === 'red' ? <AlertTriangle /> : <RotateCcw />}</i>
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
        <header><div><span>VISÃO OPERACIONAL</span><h3>Distribuição por Modalidade de Envio</h3></div><small>Total de disparos cadastrados</small></header>
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
