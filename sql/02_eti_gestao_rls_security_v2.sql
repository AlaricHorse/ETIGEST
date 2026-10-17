-- ============================================================================
-- ETI GESTÃO ESCOLAR - BLINDAGEM DE SEGURANÇA (RLS + TRIGGERS ANTI-VIOLAÇÃO)
-- Compatível com Supabase PostgreSQL + Hospedagem Vercel (Serverless/Edge)
-- ============================================================================

SET timezone = 'America/Fortaleza';

-- ----------------------------------------------------------------------------
-- 1. FUNÇÕES AUXILIARES DE SEGURANÇA (SECURITY DEFINER COM SEARCH_PATH FIXO)
-- Previne ataques de hijacking de search_path no PostgreSQL
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.profiles
    WHERE auth_user_id = auth.uid() AND is_active = TRUE
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND role = 'ADMIN'
          AND is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_assigned_to_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.teacher_classes tc
        JOIN public.profiles p ON p.id = tc.teacher_id
        WHERE p.auth_user_id = auth.uid()
          AND p.role = 'TEACHER'
          AND p.is_active = TRUE
          AND tc.class_id = p_class_id
    );
$$;

-- ----------------------------------------------------------------------------
-- 2. POLÍTICAS ROW LEVEL SECURITY (RLS) - DEFESA PROFUNDA NO BANCO DE DADOS
-- Mesmo que a chave pública (anon key) seja inspecionada no navegador,
-- nenhuma operação fora do escopo do perfil passa pelo PostgreSQL.
-- ----------------------------------------------------------------------------

-- PROFILES: Admin gerencia todos; Professor vê apenas seu próprio perfil ativo
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
    FOR ALL USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_self_select" ON public.profiles
    FOR SELECT USING (auth_user_id = auth.uid() AND is_active = TRUE);

-- COURSES: Admin gerencia todos; Professor apenas lê cursos ativos
DROP POLICY IF EXISTS "courses_admin_all" ON public.courses;
CREATE POLICY "courses_admin_all" ON public.courses
    FOR ALL USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "courses_teacher_select" ON public.courses;
CREATE POLICY "courses_teacher_select" ON public.courses
    FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = TRUE);

-- CLASSES (Turmas): Admin gerencia todas; Professor vê SOMENTE turmas vinculadas
DROP POLICY IF EXISTS "classes_admin_all" ON public.classes;
CREATE POLICY "classes_admin_all" ON public.classes
    FOR ALL USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "classes_teacher_assigned_only" ON public.classes;
CREATE POLICY "classes_teacher_assigned_only" ON public.classes
    FOR SELECT USING (public.is_teacher_assigned_to_class(id));

-- TEACHER_CLASSES: Admin gerencia vínculos; Professor vê apenas seus próprios vínculos
DROP POLICY IF EXISTS "teacher_classes_admin_all" ON public.teacher_classes;
CREATE POLICY "teacher_classes_admin_all" ON public.teacher_classes
    FOR ALL USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "teacher_classes_self_select" ON public.teacher_classes;
CREATE POLICY "teacher_classes_self_select" ON public.teacher_classes
    FOR SELECT USING (teacher_id = public.get_current_profile_id());

-- STUDENTS: Admin gerencia todos; Professor lê apenas alunos de suas turmas vinculadas
DROP POLICY IF EXISTS "students_admin_all" ON public.students;
CREATE POLICY "students_admin_all" ON public.students
    FOR ALL USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "students_teacher_select_assigned" ON public.students;
CREATE POLICY "students_teacher_select_assigned" ON public.students
    FOR SELECT USING (
        class_id IS NOT NULL AND public.is_teacher_assigned_to_class(class_id)
    );

-- ATTENDANCE_CALLS: Admin gerencia todas; Professor acessa e cria apenas para suas turmas
DROP POLICY IF EXISTS "calls_admin_all" ON public.attendance_calls;
CREATE POLICY "calls_admin_all" ON public.attendance_calls
    FOR ALL USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "calls_teacher_assigned" ON public.attendance_calls;
CREATE POLICY "calls_teacher_assigned" ON public.attendance_calls
    FOR ALL USING (public.is_teacher_assigned_to_class(class_id))
    WITH CHECK (
        public.is_teacher_assigned_to_class(class_id)
        AND teacher_id = public.get_current_profile_id()
    );

-- ATTENDANCE_RECORDS: Admin gerencia todos; Professor insere/atualiza nas suas turmas (limitado pela trigger a 1 correção)
DROP POLICY IF EXISTS "records_admin_all" ON public.attendance_records;
CREATE POLICY "records_admin_all" ON public.attendance_records
    FOR ALL USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "records_teacher_assigned" ON public.attendance_records;
CREATE POLICY "records_teacher_assigned" ON public.attendance_records
    FOR ALL USING (public.is_teacher_assigned_to_class(class_id))
    WITH CHECK (
        public.is_teacher_assigned_to_class(class_id)
        AND recorded_by = public.get_current_profile_id()
    );

-- AUDIT_LOGS & BACKUP_EXECUTIONS: Exclusivo para Administradores; ninguém pode deletar ou alterar logs!
DROP POLICY IF EXISTS "audit_admin_select_insert" ON public.audit_logs;
CREATE POLICY "audit_admin_select_insert" ON public.audit_logs
    FOR SELECT USING (public.is_active_admin());

DROP POLICY IF EXISTS "backup_admin_only" ON public.backup_executions;
CREATE POLICY "backup_admin_only" ON public.backup_executions
    FOR ALL USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

-- ----------------------------------------------------------------------------
-- 3. TRIGGER DE IMUTABILIDADE DO LOG DE AUDITORIA (ANTI-SABOTAGEM)
-- Impede UPDATE ou DELETE na tabela audit_logs até mesmo por conexões diretas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_audit_log_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'VIOLACAO_SEGURANCA: Registros de auditoria (audit_logs) são imutáveis e não podem ser alterados ou excluídos.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_log_tampering();

-- ----------------------------------------------------------------------------
-- 4. TRIGGER DE AUDITORIA AUTOMÁTICA EM ALTERAÇÕES DE ALUNOS E CURSOS (Regra 6.2)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_student_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_role user_role;
    v_action VARCHAR(50);
BEGIN
    v_actor_id := public.get_current_profile_id();
    SELECT role INTO v_actor_role FROM public.profiles WHERE id = v_actor_id;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.course_id IS DISTINCT FROM NEW.course_id THEN
            v_action := 'COURSE_CHANGE';
        ELSE
            v_action := 'UPDATE';
        END IF;

        INSERT INTO public.audit_logs (
            entity_type, entity_id, action, previous_values, new_values, performed_by, performed_by_role
        ) VALUES (
            'STUDENT', NEW.id, v_action,
            jsonb_build_object(
                'registration_number', OLD.registration_number,
                'full_name', OLD.full_name,
                'course_id', OLD.course_id,
                'class_id', OLD.class_id,
                'is_active', OLD.is_active
            ),
            jsonb_build_object(
                'registration_number', NEW.registration_number,
                'full_name', NEW.full_name,
                'course_id', NEW.course_id,
                'class_id', NEW.class_id,
                'is_active', NEW.is_active
            ),
            v_actor_id, COALESCE(v_actor_role, 'ADMIN')
        );
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_student_changes ON public.students;
CREATE TRIGGER trg_audit_student_changes
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.audit_student_changes();

-- ATTENDANCE_STATUSES: Admin gerencia todos; Professores autenticados leem status ativos
DROP POLICY IF EXISTS "statuses_admin_all" ON public.attendance_statuses;
CREATE POLICY "statuses_admin_all" ON public.attendance_statuses
    FOR ALL USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "statuses_teacher_select" ON public.attendance_statuses;
CREATE POLICY "statuses_teacher_select" ON public.attendance_statuses
    FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = TRUE);

DROP POLICY IF EXISTS "audit_admin_insert" ON public.audit_logs;
CREATE POLICY "audit_admin_insert" ON public.audit_logs
    FOR INSERT WITH CHECK (public.is_active_admin());
