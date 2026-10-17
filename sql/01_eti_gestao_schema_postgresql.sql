-- ============================================================================
-- ETI GESTÃO ESCOLAR - ESQUEMA DE BANCO DE DADOS POSTGRESQL / SUPABASE
-- Etapa 2: Estrutura Relacional, Integridade, Triggers de Negócio e RLS
-- Fuso Horário Padrão: America/Fortaleza (BRT - UTC-3)
-- ============================================================================

SET timezone = 'America/Fortaleza';

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUMS E TIPOS PERSONALIZADOS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'TEACHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE call_status AS ENUM ('DRAFT', 'SUBMITTED', 'CANCELLED', 'NO_CLASS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE backup_status AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 2. TABELA DE PERFIS DE USUÁRIOS (Vinculada ao Supabase Auth ou Auth Próprio)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE, -- Referência opcional para auth.users(id) no Supabase
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT, -- Utilizado caso opere com autenticação Node/JWT própria
    full_name VARCHAR(200) NOT NULL,
    role user_role NOT NULL DEFAULT 'TEACHER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. TABELA DE CURSOS (ID Interno Permanente separado do Código Numérico)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ID interno único e permanente
    course_code INTEGER UNIQUE NOT NULL,          -- Código numérico configurável para importação TXT
    name VARCHAR(200) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- Permite desativar para novas matrículas
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dados iniciais de exemplo da Escola Técnica Império
INSERT INTO public.courses (course_code, name) VALUES
    (1, 'ELETRICISTA BTMT'),
    (2, 'OPERADOR DE EMPILHADEIRA'),
    (3, 'INSTALAÇÃO E MANUTENÇÃO DE AR-CONDICIONADO'),
    (4, 'ELETRICISTA PREDIAL')
ON CONFLICT (course_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. TABELA DE TURMAS (Classes) E VÍNCULO DE PROFESSORES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    shift VARCHAR(50), -- Manhã, Tarde, Noite, Integral
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.teacher_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.profiles(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (teacher_id, class_id)
);

-- ----------------------------------------------------------------------------
-- 5. TABELA DE ALUNOS (3 Campos Obrigatórios + Vínculo pelo ID Permanente)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_number VARCHAR(50) UNIQUE NOT NULL, -- 1. Número da matrícula
    full_name VARCHAR(255) NOT NULL,                 -- 2. Nome completo
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT, -- 3. Curso (ID permanente)
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_registration ON public.students(registration_number);
CREATE INDEX IF NOT EXISTS idx_students_full_name ON public.students(full_name);
CREATE INDEX IF NOT EXISTS idx_students_course_id ON public.students(course_id);

-- ----------------------------------------------------------------------------
-- 6. STATUS DE FREQUÊNCIA CONFIGURÁVEIS PELA ESCOLA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_statuses (
    code VARCHAR(30) PRIMARY KEY, -- Ex: 'PRESENT', 'ABSENT', 'EARLY_LEAVE'
    label VARCHAR(100) NOT NULL,  -- Ex: 'Presença', 'Falta', 'Saída'
    counts_as_present BOOLEAN NOT NULL DEFAULT FALSE,
    counts_in_total_classes BOOLEAN NOT NULL DEFAULT TRUE,
    is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.attendance_statuses (code, label, counts_as_present, counts_in_total_classes, is_system_default) VALUES
    ('PRESENT', 'Presença', TRUE, TRUE, TRUE),
    ('ABSENT', 'Falta', FALSE, TRUE, TRUE),
    ('EARLY_LEAVE', 'Saída', FALSE, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. CHAMADAS (Sessão de Aula) E REGISTROS INDIVIDUAIS DE FREQUÊNCIA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    class_date DATE NOT NULL,
    status call_status NOT NULL DEFAULT 'DRAFT',
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (class_id, class_date)
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES public.attendance_calls(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
    class_date DATE NOT NULL,
    status_code VARCHAR(30) NOT NULL REFERENCES public.attendance_statuses(code),
    recorded_by UUID NOT NULL REFERENCES public.profiles(id),
    teacher_correction_count INTEGER NOT NULL DEFAULT 0, -- Limite máximo = 1 para professor
    last_justification TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, class_id, class_date)
);

-- ----------------------------------------------------------------------------
-- 8. AUDITORIA E HISTÓRICO DE ALTERAÇÕES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL, -- 'STUDENT', 'COURSE', 'ATTENDANCE', 'TEACHER', 'BACKUP'
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,      -- 'CREATE', 'UPDATE', 'COURSE_CHANGE', 'TEACHER_CORRECTION', 'ADMIN_CORRECTION', 'RESTORE'
    previous_values JSONB,
    new_values JSONB,
    justification TEXT,
    performed_by UUID REFERENCES public.profiles(id),
    performed_by_role user_role,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. METADADOS E MONITORAMENTO DE BACKUPS AUTOMÁTICOS (00:00 America/Fortaleza)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name VARCHAR(255) NOT NULL, -- Ex: ETI_Backup_2026-10-16.json.gz
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    checksum_sha256 VARCHAR(64),
    status backup_status NOT NULL DEFAULT 'RUNNING',
    is_validated BOOLEAN NOT NULL DEFAULT FALSE,
    is_expired_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    triggered_by VARCHAR(50) NOT NULL DEFAULT 'CRON_00H00_BRT'
);

-- ----------------------------------------------------------------------------
-- 10. TRIGGERS DE REGRAS DE NEGÓCIO NO SERVIDOR / BANCO DE DADOS
-- ----------------------------------------------------------------------------

-- Regra 7.2 e 7.3: Professor só pode corrigir 1 única vez após envio; Admin exige justificativa
CREATE OR REPLACE FUNCTION public.enforce_attendance_correction_rules()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_role user_role;
    v_call_status call_status;
BEGIN
    SELECT role INTO v_actor_role FROM public.profiles WHERE id = NEW.recorded_by;
    SELECT status INTO v_call_status FROM public.attendance_calls WHERE id = NEW.call_id;

    -- Se a chamada ainda está em rascunho (DRAFT), não conta como correção pós-envio
    IF v_call_status = 'DRAFT' THEN
        RETURN NEW;
    END IF;

    IF OLD.status_code IS DISTINCT FROM NEW.status_code THEN
        IF v_actor_role = 'TEACHER' THEN
            IF OLD.teacher_correction_count >= 1 THEN
                RAISE EXCEPTION 'LIMITE_CORRECAO_EXCEDIDO: O professor já realizou a única correção permitida para este aluno nesta data.';
            END IF;
            NEW.teacher_correction_count := OLD.teacher_correction_count + 1;
            NEW.updated_at := NOW();

            INSERT INTO public.audit_logs (
                entity_type, entity_id, action, previous_values, new_values, justification, performed_by, performed_by_role
            ) VALUES (
                'ATTENDANCE', NEW.id, 'TEACHER_CORRECTION',
                jsonb_build_object('status_code', OLD.status_code, 'correction_count', OLD.teacher_correction_count),
                jsonb_build_object('status_code', NEW.status_code, 'correction_count', NEW.teacher_correction_count),
                NEW.last_justification, NEW.recorded_by, 'TEACHER'
            );

        ELSIF v_actor_role = 'ADMIN' THEN
            IF NEW.last_justification IS NULL OR LENGTH(TRIM(NEW.last_justification)) < 5 THEN
                RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA: Correções administrativas exigem justificativa explícita.';
            END IF;
            NEW.updated_at := NOW();

            INSERT INTO public.audit_logs (
                entity_type, entity_id, action, previous_values, new_values, justification, performed_by, performed_by_role
            ) VALUES (
                'ATTENDANCE', NEW.id, 'ADMIN_CORRECTION',
                jsonb_build_object('status_code', OLD.status_code),
                jsonb_build_object('status_code', NEW.status_code),
                NEW.last_justification, NEW.recorded_by, 'ADMIN'
            );
        ELSE
            RAISE EXCEPTION 'ACESSO_NEGADO: Perfil inválido para alteração de frequência.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_attendance_correction ON public.attendance_records;
CREATE TRIGGER trg_attendance_correction
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.enforce_attendance_correction_rules();

-- ----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) - PROTEÇÃO DE DADOS POR PERFIL
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_executions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.attendance_statuses ENABLE ROW LEVEL SECURITY;
