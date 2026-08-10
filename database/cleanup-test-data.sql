-- Limpeza conservadora de testes e lixo do banco.
-- Execute no SQL Editor do Supabase.
--
-- O que remove:
-- - disparos claramente marcados como teste/demo/exemplo/rascunho;
-- - regras de base claramente marcadas como teste/demo/exemplo/rascunho;
-- - registros praticamente vazios criados por engano;
-- - cadastros de campanha/publico/responsavel vazios, inativos ou de teste que nao estao em uso.
--
-- O que preserva:
-- - usuarios autorizados;
-- - disparos, bases e cadastros com nome real;
-- - cadastros usados por disparos ou regras de base.

BEGIN;

WITH dispatches_to_delete AS (
  SELECT d.id
  FROM public.dispatches d
  WHERE EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('(^|[^[:alnum:]])teste[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])test[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])demo[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])exemplo[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])sample[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])mock[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])rascunho[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])temporario[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])temporário[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])lorem[[:alnum:]_ -]*($|[^[:alnum:]])')
    ) AS p(pattern)
    WHERE LOWER(CONCAT_WS(
      ' ',
      d.template_name,
      d.campaign,
      d.audience,
      d.description,
      d.subject,
      d.body,
      d.html_content
    )) ~ p.pattern
  )
  OR (
    TRIM(COALESCE(d.template_name, '')) = ''
    AND TRIM(COALESCE(d.campaign, '')) = ''
    AND TRIM(COALESCE(d.audience, '')) = ''
    AND TRIM(COALESCE(d.description, '')) = ''
    AND TRIM(COALESCE(d.subject, '')) = ''
    AND TRIM(COALESCE(d.body, '')) = ''
    AND TRIM(COALESCE(d.html_content, '')) = ''
    AND d.base_rule_id IS NULL
    AND COALESCE(JSONB_ARRAY_LENGTH(d.attachments), 0) = 0
  )
)
DELETE FROM public.dispatches d
USING dispatches_to_delete x
WHERE d.id = x.id;

WITH bases_to_delete AS (
  SELECT b.id
  FROM public.base_rules b
  WHERE EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('(^|[^[:alnum:]])teste[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])test[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])demo[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])exemplo[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])sample[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])mock[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])rascunho[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])temporario[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])temporário[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])lorem[[:alnum:]_ -]*($|[^[:alnum:]])')
    ) AS p(pattern)
    WHERE LOWER(CONCAT_WS(
      ' ',
      b.campaign,
      b.main_base,
      b.excluded_bases,
      b.expected_action,
      b.responsible,
      b.notes
    )) ~ p.pattern
  )
  OR (
    TRIM(COALESCE(b.campaign, '')) = ''
    AND TRIM(COALESCE(b.main_base, '')) = ''
    AND TRIM(COALESCE(b.excluded_bases, '')) = ''
    AND TRIM(COALESCE(b.expected_action, '')) = ''
    AND TRIM(COALESCE(b.notes, '')) = ''
    AND NOT EXISTS (
      SELECT 1
      FROM public.dispatches d
      WHERE d.base_rule_id = b.id
    )
  )
)
DELETE FROM public.base_rules b
USING bases_to_delete x
WHERE b.id = x.id;

DELETE FROM public.campaign_options c
WHERE (
  TRIM(COALESCE(c.name, '')) = ''
  OR c.active = FALSE
  OR EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('(^|[^[:alnum:]])teste[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])test[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])demo[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])exemplo[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])sample[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])mock[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])rascunho[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])temporario[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])temporário[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])lorem[[:alnum:]_ -]*($|[^[:alnum:]])')
    ) AS p(pattern)
    WHERE LOWER(c.name) ~ p.pattern
  )
)
AND NOT EXISTS (
  SELECT 1 FROM public.dispatches d WHERE d.campaign = c.name
)
AND NOT EXISTS (
  SELECT 1 FROM public.base_rules b WHERE b.campaign = c.name
);

DELETE FROM public.audience_options a
WHERE (
  TRIM(COALESCE(a.name, '')) = ''
  OR a.active = FALSE
  OR EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('(^|[^[:alnum:]])teste[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])test[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])demo[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])exemplo[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])sample[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])mock[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])rascunho[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])temporario[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])temporário[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])lorem[[:alnum:]_ -]*($|[^[:alnum:]])')
    ) AS p(pattern)
    WHERE LOWER(a.name) ~ p.pattern
  )
)
AND NOT EXISTS (
  SELECT 1 FROM public.dispatches d WHERE d.audience = a.name
);

DELETE FROM public.responsible_options r
WHERE (
  TRIM(COALESCE(r.name, '')) = ''
  OR r.active = FALSE
  OR EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('(^|[^[:alnum:]])teste[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])test[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])demo[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])exemplo[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])sample[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])mock[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])rascunho[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])temporario[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])temporário[[:alnum:]_ -]*($|[^[:alnum:]])'),
        ('(^|[^[:alnum:]])lorem[[:alnum:]_ -]*($|[^[:alnum:]])')
    ) AS p(pattern)
    WHERE LOWER(r.name) ~ p.pattern
  )
)
AND NOT EXISTS (
  SELECT 1 FROM public.dispatches d WHERE d.responsible = r.name
)
AND NOT EXISTS (
  SELECT 1 FROM public.base_rules b WHERE b.responsible = r.name
);

COMMIT;

NOTIFY pgrst, 'reload schema';
