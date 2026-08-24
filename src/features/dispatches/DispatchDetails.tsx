import type { ReactNode } from 'react';
import type { BaseRule, Dispatch } from '../../types';
import { dispatchValidation, fmtDate } from '../../logic';
import { channelName, dispatchDisplayName, dispatchTime, formatBytes, isoDate, richTextHtml, statusClass } from '../../utils/app';
import { ValidationBadge } from '../../components/feedback/ValidationBadge';

function DetailItem({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  const isPrimitive = typeof value === 'string' || typeof value === 'number';
  return (
    <div className={`detailItem ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {isPrimitive ? <strong>{value || '-'}</strong> : <div className="detailValue">{value || '-'}</div>}
    </div>
  );
}

function RichContentPreview({ html }: { html: string }) {
  if (!html.trim()) return <>-</>;
  return <div className="richContentPreview" dangerouslySetInnerHTML={{ __html: richTextHtml(html) }} />;
}

export function DispatchDetails({ dispatch, base, validation, conflicts, duplicateCount }: {
  dispatch: Dispatch;
  base?: BaseRule;
  validation: ReturnType<typeof dispatchValidation>;
  conflicts: Dispatch[];
  duplicateCount: number;
}) {
  const displayName = dispatchDisplayName(dispatch);
  const content = dispatch.channel === 'html_email'
    ? dispatch.htmlContent
    : dispatch.channel === 'whatsapp'
      ? dispatch.body
      : [dispatch.subject, dispatch.body].filter(Boolean).join('\n\n');
  const alerts = [
    ...validation.issues,
    ...(conflicts.length ? [`Sobreposição com ${conflicts.length} disparo(s)`] : []),
    ...(duplicateCount ? [`Mesmo nome em ${duplicateCount} outro(s) disparo(s)`] : [])
  ];

  return (
    <div className="detailContent calendarDispatchDetail">
      <div className="detailHero">
        <div>
          <span className={`channelBadge ${dispatch.channel || 'email'}`}>{channelName(dispatch.channel || 'email')}</span>
          <h3>{displayName || 'Disparo sem nome'}</h3>
          <p>{dispatch.campaign || 'Sem campanha'}{dispatch.audience ? ` para ${dispatch.audience}` : ''}</p>
        </div>
        <div className="detailBadges">
          <span className={`channelBadge ${dispatch.channel || 'email'}`}>{channelName(dispatch.channel || 'email')}</span>
          <span className={`statusText ${statusClass(dispatch.status)}`}>● {dispatch.status}</span>
        </div>
      </div>

      <div className="detailGrid detailMainGrid">
        <DetailItem label="Data" value={fmtDate(dispatch.date)} />
        <DetailItem label="Horário" value={dispatchTime(dispatch.time)} />
        <DetailItem label="Campanha" value={dispatch.campaign || '-'} />
        <DetailItem label="Público" value={dispatch.audience || '-'} />
        <DetailItem label="Base" value={base?.mainBase || 'Sem base'} />
        <DetailItem label="Responsável" value={dispatch.responsible || '-'} />
        <DetailItem label="Template" value={dispatch.templateName || '-'} />
        <DetailItem label="Integração" value={dispatch.chip || '-'} />
      </div>

      <section className="detailSection">
        <div className="formSectionTitle">Conteúdo</div>
        <div className="detailContentPreview">
          {dispatch.channel === 'html_email'
            ? <HtmlPreviewBlock html={dispatch.htmlContent} />
            : <RichContentPreview html={content} />}
        </div>
      </section>

      {dispatch.description && (
        <section className="detailSection">
          <div className="formSectionTitle">Descrição</div>
          <p className="detailPlainText">{dispatch.description}</p>
        </section>
      )}

      <section className="detailSection">
        <div className="formSectionTitle">Validação</div>
        <div className="detailValidationSummary">
          <ValidationBadge validation={validation} />
          <span>{alerts.length ? 'Confira as pendências reais deste disparo.' : 'Tudo certo'}</span>
        </div>
        {alerts.length ? (
          <div className="detailAlertList">{alerts.map(alert => <span className="overlap" key={alert}>{alert}</span>)}</div>
        ) : (
          <span className="statusText pronto-para-disparo">✓ Tudo certo</span>
        )}
      </section>

      <div className="detailGrid compact">
        <DetailItem label="Criado em" value={fmtDate(isoDate(dispatch.createdAt))} />
        <DetailItem label="Bases excluídas" value={base?.excludedBases || 'Nenhuma exclusão configurada'} />
        {dispatch.attachments.length > 0 && (
          <DetailItem label="Anexos" value={<AttachmentPreview attachments={dispatch.attachments} />} wide />
        )}
      </div>
    </div>
  );
}

function HtmlPreviewBlock({ html }: { html: string }) {
  return (
    <div className="htmlPreviewBlock">
      <button
        type="button"
        className="btn primary small"
        disabled={!html.trim()}
        onClick={() => navigator.clipboard.writeText(html)}
      >
        Copiar HTML
      </button>
      <pre className="htmlPreview">{html || '-'}</pre>
    </div>
  );
}

function AttachmentPreview({ attachments }: { attachments: Dispatch['attachments'] }) {
  return (
    <div className="attachmentGrid previewOnly">
      {attachments.map(attachment => (
        <div className="attachmentItem" key={attachment.id}>
          <img src={attachment.dataUrl} alt={attachment.name} />
          <div>
            <strong>{attachment.name}</strong>
            <small>{formatBytes(attachment.size)}</small>
          </div>
          <div className="attachmentActions">
            <a href={attachment.dataUrl} download={attachment.name}>Baixar</a>
          </div>
        </div>
      ))}
    </div>
  );
}
