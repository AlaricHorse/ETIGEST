# ETI Gestão Escolar — Repositório Completo (Next.js + Supabase + Vercel)

Sistema web completo desenvolvido para a **Escola Técnica Império (ETI)**, pronto para deploy na **Vercel (`vercel.app`)** com banco de dados relacional **PostgreSQL (Supabase)**, **Row Level Security (RLS)** e **Backup Automático Diário às 00h00 (`America/Fortaleza`)**.

## Estrutura Completa de Arquivos deste Pacote

- `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `.env.example`, `.gitignore`, `vercel.json`
- `sql/01_eti_gestao_schema_postgresql.sql` — Tabelas relacionais, Enums, Índices e Trigger de limite de 1 correção por professor.
- `sql/02_eti_gestao_rls_security_v2.sql` — Políticas Row Level Security (RLS), isolamento por turma e imutabilidade de `audit_logs`.
- `sql/03_eti_gestao_storage_and_seed.sql` — Bucket privado `eti-backups` no Supabase Storage e turmas iniciais da ETI.
- `src/middleware.ts` — Proteção de borda (Edge Middleware) para `/admin` e `/professor`.
- `src/lib/supabase/server.ts` & `src/lib/supabase/client.ts` — Conexões seguras (`server-only`).
- `src/lib/auth/guard.ts` — Validação Anti-CSRF e controle RBAC no servidor.
- `src/lib/reports/attendance-calculator.ts` — Cálculo oficial de frequência da ETI.
- `src/lib/export/xlsx-pdf-generator.ts` — Geração de relatórios Excel (`.xlsx`) e PDF (`.pdf`).
- `src/app/api/auth/login/route.ts` & `logout/route.ts` — Autenticação por usuário ou e-mail e senha.
- `src/app/api/admin/courses/route.ts` — Gestão de cursos preservando o UUID interno permanente.
- `src/app/api/admin/classes/route.ts` — Gestão de turmas.
- `src/app/api/admin/teachers/route.ts` — Criação, bloqueio e vínculo de professores às turmas.
- `src/app/api/admin/students/route.ts` — CRUD de alunos (3 campos obrigatórios), confirmação de troca de curso e histórico individual.
- `src/app/api/admin/students/import-txt/route.ts` — Importação em massa `.txt` com prévia e decisão explícita de conflitos.
- `src/app/api/teacher/classes/route.ts` & `attendance/route.ts` — Chamadas mobile-first e trava de 1 correção pós-envio.
- `src/app/api/admin/attendance/correct/route.ts` — Correção administrativa com justificativa obrigatória.
- `src/app/api/admin/dashboard/route.ts` — Indicadores reais e matriz de frequência.
- `src/app/api/admin/export/route.ts` & `restore/route.ts` — Exportação em 5 formatos e restauração JSON com prévia.
- `src/app/api/admin/backups/route.ts` & `src/app/api/cron/daily-backup/route.ts` — Backup automático às 00h00 (`America/Fortaleza`) em `.json.gz` com validação SHA-256 e retenção dos últimos 30 backups.
- `src/app/login/page.tsx`, `src/app/professor/chamadas/page.tsx`, `src/app/admin/page.tsx` e componentes em `src/components/`.
