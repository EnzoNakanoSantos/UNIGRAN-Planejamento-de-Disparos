export const READY_STATUS = 'Pronto para disparo';

function hasText(value) {
  return String(value || '').trim().length > 0;
}

function normalizedChannel(dispatch) {
  const channel = dispatch?.channel || 'email';
  return channel === 'whatsapp' || channel === 'html_email' ? channel : 'email';
}

export function dispatchReadinessChecks(dispatch) {
  const channel = normalizedChannel(dispatch);
  const checks = [
    { key: 'date', label: 'Data definida', field: 'data', done: hasText(dispatch?.date || dispatch?.dispatch_date) },
    { key: 'time', label: 'Horario definido', field: 'horario', done: hasText(dispatch?.time || dispatch?.dispatch_time) },
    { key: 'campaign', label: 'Campanha selecionada', field: 'campanha', done: hasText(dispatch?.campaign) },
    { key: 'audience', label: 'Publico selecionado', field: 'publico', done: hasText(dispatch?.audience) },
    { key: 'baseId', label: 'Base selecionada', field: 'base', done: hasText(dispatch?.baseId || dispatch?.base_rule_id) },
    { key: 'responsible', label: 'Responsavel definido', field: 'responsavel', done: hasText(dispatch?.responsible) },
    { key: 'templateName', label: 'Template definido', field: 'template', done: hasText(dispatch?.templateName || dispatch?.template_name) }
  ];

  if (channel !== 'whatsapp') {
    checks.push({
      key: 'subject',
      label: 'Assunto definido',
      field: 'assunto',
      done: hasText(dispatch?.subject)
    });
  }

  checks.push(channel === 'html_email'
    ? { key: 'htmlContent', label: 'HTML preenchido', field: 'conteudo HTML', done: hasText(dispatch?.htmlContent || dispatch?.html_content) }
    : {
        key: 'body',
        label: channel === 'whatsapp' ? 'Mensagem preenchida' : 'Conteudo preenchido',
        field: channel === 'whatsapp' ? 'mensagem' : 'conteudo',
        done: hasText(dispatch?.body)
      });

  return checks;
}

export function missingReadyDispatchFields(dispatch) {
  return dispatchReadinessChecks(dispatch)
    .filter(item => !item.done)
    .map(item => item.field);
}

export function canMarkDispatchReady(dispatch) {
  return missingReadyDispatchFields(dispatch).length === 0;
}

export function shouldValidateReadiness(status) {
  return status === READY_STATUS;
}
