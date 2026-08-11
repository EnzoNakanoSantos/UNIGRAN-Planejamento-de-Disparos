import { useState } from 'react';
import type { Dispatch, FileAttachment } from '../../types';
import { fileToAttachment, formatBytes, isExcelFile } from '../../utils/app';
import { MAX_ATTACHMENT_SIZE } from '../../config/dispatch';

export function AttachmentPicker({ attachments, onAdd, onRemove }: {
  attachments: Dispatch['attachments'];
  onAdd: (attachments: Dispatch['attachments']) => void;
  onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage('');
    try {
      const allFiles = [...files];
      const invalidSize = allFiles.filter(file => file.size > MAX_ATTACHMENT_SIZE);
      const images = allFiles.filter(file => ['image/png', 'image/jpeg'].includes(file.type) && file.size <= MAX_ATTACHMENT_SIZE);
      if (invalidSize.length) {
        setMessage(`${invalidSize.length} imagem(ns) acima de 20 MB não foram anexadas.`);
      }
      onAdd(await Promise.all(images.map(fileToAttachment)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="attachmentPicker">
      <label className="attachmentInput">
        <input
          type="file"
          accept="image/png,image/jpeg,.png,.jpg,.jpeg"
          multiple
          onChange={event => {
            handleFiles(event.target.files);
            event.currentTarget.value = '';
          }}
        />
        <span>{busy ? 'Carregando imagens...' : 'Anexar PNG/JPG/JPEG até 20 MB'}</span>
      </label>
      {message && <small className="attachmentMessage">{message}</small>}
      {attachments.length > 0 && (
        <div className="attachmentGrid">
          {attachments.map(attachment => (
            <div className="attachmentItem" key={attachment.id}>
              <img src={attachment.dataUrl} alt={attachment.name} />
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

