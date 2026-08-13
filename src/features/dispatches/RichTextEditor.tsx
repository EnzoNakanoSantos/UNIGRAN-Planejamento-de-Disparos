import { useEffect, useRef } from 'react';
import { insertHtmlAtSelection, richTextHtml, sanitizeRichHtml } from '../../utils/app';

export function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    editor.innerHTML = richTextHtml(value);
  }, [value]);

  function syncValue() {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(sanitizeRichHtml(editor.innerHTML));
  }

  return (
    <div
      ref={editorRef}
      className="contentEditor"
      contentEditable
      role="textbox"
      aria-multiline="true"
      suppressContentEditableWarning
      onInput={syncValue}
      onBlur={event => {
        const clean = sanitizeRichHtml(event.currentTarget.innerHTML);
        event.currentTarget.innerHTML = clean;
        onChange(clean);
      }}
      onPaste={event => {
        const html = event.clipboardData.getData('text/html');
        const text = event.clipboardData.getData('text/plain');
        if (!html && !text) return;
        event.preventDefault();
        insertHtmlAtSelection(richTextHtml(html || text));
        syncValue();
      }}
    />
  );
}

