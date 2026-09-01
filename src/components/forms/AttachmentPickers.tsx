import { useState } from 'react';
import type { Dispatch, FileAttachment } from '../../types';
import { fileToAttachment, formatBytes, isExcelFile } from '../../utils/app';
import { MAX_ATTACHMENT_SIZE } from '../../config/dispatch';

export function AttachmentPicker({ attachments, onAdd, onRemove, label }: {
  attachments: Dispatch['attachments'];
  onAdd: (attachments: Dispatch['attachments']) => void;
  onRemove: (id: string) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage('');
    try {
      const allFiles = [...files];
      const invalidType = allFiles.filter(file => !/\.html$/i.test(file.name));
      const htmlCandidates = allFiles.filter(file => /\.html$/i.test(file.name));
      const invalidSize = htmlCandidates.filter(file => file.size > MAX_ATTACHMENT_SIZE);
      const htmlFiles = htmlCandidates.filter(file => file.size <= MAX_ATTACHMENT_SIZE);
      const messages: string[] = [];
      if (invalidType.length) messages.push(`${invalidType.length} arquivo(s) ignorado(s): anexe apenas .html.`);
      if (invalidSize.length) messages.push(`${invalidSize.length} arquivo(s) acima de 20 MB não foram anexados.`);
      setMessage(messages.join(' '));
      if (htmlFiles.length) onAdd(await Promise.all(htmlFiles.map(fileToAttachment)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="attachmentPicker">
      <label className="attachmentInput">
        <input
          type="file"
          accept=".html,text/html"
          multiple
          onChange={event => {
            handleFiles(event.target.files);
            event.currentTarget.value = '';
          }}
        />
        <span>{busy ? 'Carregando arquivos HTML...' : label || 'Anexar arquivo(s) .HTML até 20 MB'}</span>
      </label>
      {message && <small className="attachmentMessage">{message}</small>}
      {attachments.length > 0 && (
        <div className="attachmentGrid">
          {attachments.map(attachment => (
            <div className="attachmentItem" key={attachment.id}>
              <div className="fileIcon">HTML</div>
              <div>
                <strong>{attachment.name}</strong>
                <small>{formatBytes(attachment.size)}</small>
              </div>
              <div className="attachmentActions">
                <a href={attachment.dataUrl} download={attachment.name}>Baixar</a>
                <button type="button" className="danger" onClick={() => onRemove(attachment.id)}>Remover</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SpreadsheetAttachmentPicker({ attachment, onChange, onRemove }: {
  attachment: FileAttachment | null;
  onChange: (attachment: FileAttachment) => void;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      if (!isExcelFile(file)) {
        setMessage('Anexe apenas arquivos .xls ou .xlsx.');
        return;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setMessage('A base de disparo precisa ter até 20 MB.');
        return;
      }
      onChange(await fileToAttachment(file));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="attachmentPicker">
      <label className="attachmentInput">
        <input
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={event => {
            handleFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <span>{busy ? 'Carregando base de disparo...' : attachment ? 'Trocar base de disparo' : 'Anexar base XLS/XLSX até 20 MB'}</span>
      </label>
      {message && <small className="attachmentMessage">{message}</small>}
      {attachment && (
        <div className="attachmentGrid single">
          <div className="attachmentItem">
            <div className="fileIcon">XLS</div>
            <div>
              <strong>{attachment.name}</strong>
              <small>{formatBytes(attachment.size)}</small>
            </div>
            <div className="attachmentActions">
              <a href={attachment.dataUrl} download={attachment.name}>Baixar</a>
              <button type="button" className="danger" onClick={onRemove}>Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
