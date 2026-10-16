-- ============================================================================
-- ETI GESTÃO ESCOLAR - CONFIGURAÇÃO DO BUCKET PRIVADO DE BACKUPS E TURMAS INICIAIS
-- Execute após 01_eti_gestao_schema_postgresql.sql e 02_eti_gestao_rls_security_v2.sql
-- ============================================================================

SET timezone = 'America/Fortaleza';

-- 1. Criar Bucket Privado "eti-backups" no Supabase Storage (Item 10.3 e 11)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'eti-backups',
    'eti-backups',
    FALSE, -- Estritamente privado!
    52428800, -- Limite de 50MB por arquivo compactado .json.gz
    ARRAY['application/gzip', 'application/x-gzip', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

-- 2. Políticas RLS no Storage: Somente Administradores ativos podem ler ou gerenciar backups
DROP POLICY IF EXISTS "eti_backups_admin_only_select" ON storage.objects;
CREATE POLICY "eti_backups_admin_only_select" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'eti-backups' AND public.is_active_admin());

DROP POLICY IF EXISTS "eti_backups_admin_only_insert" ON storage.objects;
CREATE POLICY "eti_backups_admin_only_insert" ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'eti-backups' AND public.is_active_admin());

DROP POLICY IF EXISTS "eti_backups_admin_only_delete" ON storage.objects;
CREATE POLICY "eti_backups_admin_only_delete" ON storage.objects
    FOR DELETE
    USING (bucket_id = 'eti-backups' AND public.is_active_admin());

-- 3. Criar turmas iniciais vinculadas aos cursos da Escola Técnica Império
INSERT INTO public.classes (course_id, code, name, shift, is_active)
SELECT id, 'BTMT-2026-NOITE', 'TURMA ELETRICISTA BTMT - NOITE', 'Noite', TRUE
FROM public.courses WHERE course_code = 1
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.classes (course_id, code, name, shift, is_active)
SELECT id, 'EMP-2026-MANHA', 'TURMA OPERADOR DE EMPILHADEIRA - MANHÃ', 'Manhã', TRUE
FROM public.courses WHERE course_code = 2
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.classes (course_id, code, name, shift, is_active)
SELECT id, 'AR-2026-TARDE', 'TURMA AR-CONDICIONADO - TARDE', 'Tarde', TRUE
FROM public.courses WHERE course_code = 3
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.classes (course_id, code, name, shift, is_active)
SELECT id, 'PRED-2026-NOITE', 'TURMA ELETRICISTA PREDIAL - NOITE', 'Noite', TRUE
FROM public.courses WHERE course_code = 4
ON CONFLICT (code) DO NOTHING;
