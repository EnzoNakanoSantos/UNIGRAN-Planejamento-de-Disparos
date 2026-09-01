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

async function copyPlainText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function htmlToPlainText(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.innerText || doc.body.textContent || '';
}

function copyHtmlWithSelection(html: string) {
  const container = document.createElement('div');
  container.contentEditable = 'true';
  container.setAttribute('aria-hidden', 'true');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  container.innerHTML = html;
  document.body.appendChild(container);

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(container);
  selection?.removeAllRanges();
  selection?.addRange(range);

  const copied = document.execCommand('copy');
  selection?.removeAllRanges();
  container.remove();
  return copied;
}

async function copyFormattedContent(html: string, plainText: string) {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' })
        })
      ]);
      return;
    }
  } catch {
    // Alguns navegadores bloqueiam ClipboardItem; tenta preservar a formatação via seleção.
  }

  try {
    if (copyHtmlWithSelection(html)) return;
  } catch {
    // Último fallback: texto puro.
  }

  await copyPlainText(plainText);
}

async function copyRichContent(value: string) {
  const html = richTextHtml(value);
  await copyFormattedContent(html, htmlToPlainText(html));
}

async function copyHtmlContent(value: string) {
  await copyPlainText(value.trim());
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
          <h3 title={displayName || 'Disparo sem nome'}>{displayName || 'Disparo sem nome'}</h3>
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
        <div className="detailSectionHeader">
          <div className="formSectionTitle">Conteúdo</div>
          {dispatch.channel === 'html_email' ? (
            <button
              type="button"
              className="btn ghost small contentCopyButton"
              disabled={!dispatch.htmlContent.trim()}
              onClick={() => copyHtmlContent(dispatch.htmlContent)}
            >
              Copiar HTML
            </button>
          ) : (
            <button
              type="button"
              className="btn ghost small contentCopyButton"
              disabled={!dispatch.body.trim()}
              onClick={() => copyRichContent(dispatch.body)}
            >
              Copiar corpo
            </button>
          )}
        </div>
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
          <div className="detailAlertList">{alerts.map(alert => (
            <span
              className={`overlap${alert === 'Base principal não informada' ? ' baseMissingAlert' : ''}`}
              key={alert}
            >
              {alert}
            </span>
          ))}</div>
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
      <pre className="htmlPreview">{html || '-'}</pre>
    </div>
  );
}

function AttachmentPreview({ attachments }: { attachments: Dispatch['attachments'] }) {
  return (
    <div className="attachmentGrid previewOnly">
      {attachments.map(attachment => (
        <div className="attachmentItem" key={attachment.id}>
          <div className="fileIcon">{(attachment.name.split('.').pop() || 'ARQ').slice(0, 4).toUpperCase()}</div>
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
