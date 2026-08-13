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
  return (
    <div className="detailContent">
      <div className="detailHero">
        <div>
          <span className={`channelBadge ${dispatch.channel || 'email'}`}>{channelName(dispatch.channel || 'email')}</span>
          <h3>{displayName || 'Disparo sem nome'}</h3>
          <p>{dispatch.campaign || 'Sem campanha'}{dispatch.audience ? ` para ${dispatch.audience}` : ''}</p>
        </div>
        <ValidationBadge validation={validation} />
      </div>

      <div className="detailGrid">
        <DetailItem label="Data de disparo" value={fmtDate(dispatch.date)} />
        <DetailItem label="Hora do disparo" value={dispatchTime(dispatch.time)} />
        <DetailItem label="Criado em" value={fmtDate(isoDate(dispatch.createdAt))} />
        <DetailItem label="Status" value={<span className={`statusText ${statusClass(dispatch.status)}`}>{dispatch.status}</span>} />
        <DetailItem label="Nome do template" value={dispatch.templateName || '-'} />
        <DetailItem label="Integração" value={dispatch.chip || '-'} />
        <DetailItem label="Campanha" value={dispatch.campaign || '-'} />
        <DetailItem label="Público" value={dispatch.audience || '-'} />
        <DetailItem label="Responsável" value={dispatch.responsible || '-'} />
        <DetailItem label="Base principal" value={base?.mainBase || 'Sem base'} wide />
        <DetailItem label="Bases excluídas" value={base?.excludedBases || 'Nenhuma exclusão configurada'} wide />
        <DetailItem label="Assunto" value={dispatch.subject || '-'} wide />
        <DetailItem label="Conteúdo do e-mail (corpo)" value={<RichContentPreview html={dispatch.body} />} wide />
        <DetailItem label="Descrição" value={dispatch.description || '-'} wide />
        {dispatch.attachments.length > 0 && (
          <DetailItem label="Anexos" value={<AttachmentPreview attachments={dispatch.attachments} />} wide />
        )}
        {dispatch.channel === 'html_email' && (
          <DetailItem label="HTML salvo" value={<HtmlPreviewBlock html={dispatch.htmlContent} />} wide />
        )}
        <DetailItem label="Alertas" value={validation.issues.length ? validation.issues.join('; ') : 'Sem alertas'} wide />
        {conflicts.length > 0 && (
          <DetailItem
            label="Sobreposição"
            value={`${conflicts.length} disparo(s) para o mesmo público em data próxima`}
            wide
          />
        )}
        {duplicateCount > 0 && (
          <DetailItem
            label="Nome duplicado"
            value={`Mesmo nome em ${duplicateCount} outro(s) disparo(s)`}
            wide
          />
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

