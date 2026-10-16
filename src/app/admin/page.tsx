// src/app/admin/page.tsx
// Rota Exclusiva /admin (Protegida no Servidor pelo Middleware + API Guards)
'use client';

import React, { useEffect, useState } from 'react';
import StudentImportPanel from '@/components/admin/StudentImportModal';
import MonthlyWeeklyAttendanceMatrix from '@/components/admin/MonthlyWeeklyAttendanceMatrix';
import BackupAndExportPanel from '@/components/admin/BackupAndExportPanel';

type AdminTab = 'DASHBOARD' | 'STUDENTS' | 'IMPORT_TXT' | 'COURSES' | 'TEACHERS' | 'BACKUPS';

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('DASHBOARD');
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Estados de criação rápida
  const [newStudentReg, setNewStudentReg] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCourseId, setNewStudentCourseId] = useState('');

  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');

  const [feedback, setFeedback] = useState<string | null>(null);

  const loadAllAdminData = async () => {
    const [dashRes, courseRes, classRes, stuRes, teachRes, bkpRes] = await Promise.all([
      fetch('/api/admin/dashboard').then((r) => r.json()),
      fetch('/api/admin/courses').then((r) => r.json()),
      fetch('/api/admin/classes').then((r) => r.json()),
      fetch(`/api/admin/students?search=${encodeURIComponent(searchQuery)}`).then((r) => r.json()),
      fetch('/api/admin/teachers').then((r) => r.json()),
      fetch('/api/admin/backups').then((r) => r.json()),
    ]);
    setDashboardData(dashRes);
    setCourses(courseRes.courses || []);
    setClasses(classRes.classes || []);
    setStudents(stuRes.students || []);
    setTeachers(teachRes.teachers || []);
    setBackups(bkpRes.executions || []);
    if (courseRes.courses?.[0]?.id && !newStudentCourseId) {
      setNewStudentCourseId(courseRes.courses[0].id);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, [searchQuery]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registration_number: newStudentReg,
        full_name: newStudentName,
        course_id: newStudentCourseId,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewStudentReg('');
      setNewStudentName('');
      setFeedback('Aluno cadastrado com sucesso!');
      loadAllAdminData();
    } else {
      setFeedback(data.error || 'Erro ao cadastrar aluno.');
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch('/api/admin/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_code: Number(newCourseCode),
        name: newCourseName,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewCourseCode('');
      setNewCourseName('');
      setFeedback('Curso cadastrado com ID interno permanente!');
      loadAllAdminData();
    } else {
      setFeedback(data.error || 'Erro ao cadastrar curso.');
    }
  };

  const ind = dashboardData?.indicators || {
    totalStudents: 0,
    totalCourses: 0,
    totalActiveTeachers: 0,
    submittedCallsCount: 0,
    pendingCallsCount: 0,
    overallFrequency: 'Sem dados de frequência',
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Barra Superior Institucional ETI */}
      <header className="bg-[#0A192F] text-white border-b-4 border-[#FF6B00] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#FFB800]">
              ESCOLA TÉCNICA IMPÉRIO • PAINEL ADMINISTRATIVO (/admin)
            </span>
            <h1 className="text-xl font-extrabold">ETI Gestão Escolar</h1>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            {[
              { id: 'DASHBOARD', label: 'Indicadores & Relatórios' },
              { id: 'STUDENTS', label: 'Alunos' },
              { id: 'IMPORT_TXT', label: 'Importar TXT' },
              { id: 'COURSES', label: 'Cursos e Códigos' },
              { id: 'TEACHERS', label: 'Professores' },
              { id: 'BACKUPS', label: 'Exportação & Backups' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === tab.id
                    ? 'bg-[#FF6B00] text-white shadow'
                    : 'bg-[#112240] text-slate-200 hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700"
            >
              Sair
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {feedback && (
          <div className="p-4 rounded-xl bg-amber-50 border border-[#FFB800] text-[#0A192F] font-bold text-sm">
            {feedback}
          </div>
        )}

        {activeTab === 'DASHBOARD' && (
          <div className="space-y-6">
            {/* Cards de Indicadores Reais (Item 8) */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-bold">Total de Alunos</span>
                <p className="text-2xl font-extrabold text-[#0A192F] mt-1">{ind.totalStudents}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-bold">Total de Cursos</span>
                <p className="text-2xl font-extrabold text-[#0A192F] mt-1">{ind.totalCourses}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-bold">Professores Ativos</span>
                <p className="text-2xl font-extrabold text-[#0A192F] mt-1">{ind.totalActiveTeachers}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-bold">Chamadas Realizadas</span>
                <p className="text-2xl font-extrabold text-emerald-600 mt-1">{ind.submittedCallsCount}</p>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-bold">Chamadas Pendentes</span>
                <p className="text-2xl font-extrabold text-[#FF6B00] mt-1">{ind.pendingCallsCount}</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#0A192F] text-white shadow-sm">
                <span className="text-xs text-[#FFB800] font-bold">Frequência Geral</span>
                <p className="text-xl font-extrabold mt-1">{ind.overallFrequency}</p>
              </div>
            </div>

            <MonthlyWeeklyAttendanceMatrix
              students={dashboardData?.studentSummaries || []}
              calls={dashboardData?.calls || []}
              records={dashboardData?.records || []}
            />
          </div>
        )}

        {activeTab === 'STUDENTS' && (
          <div className="space-y-6">
            {/* Cadastro Rápido com os 3 Campos Obrigatórios (Item 5) */}
            <form
              onSubmit={handleCreateStudent}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
            >
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  1. Número da Matrícula *
                </label>
                <input
                  type="text"
                  required
                  value={newStudentReg}
                  onChange={(e) => setNewStudentReg(e.target.value)}
                  placeholder="Ex: 1005"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  2. Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="Ex: CARLOS EDUARDO SILVA"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  3. Curso *
                </label>
                <select
                  required
                  value={newStudentCourseId}
                  onChange={(e) => setNewStudentCourseId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.course_code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="py-2.5 px-5 rounded-xl bg-[#FF6B00] text-white font-bold text-sm hover:bg-[#e66000]"
              >
                Cadastrar Aluno
              </button>
            </form>

            {/* Pesquisa e Tabela de Alunos */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-[#0A192F]">Alunos Matriculados</h2>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar por matrícula ou nome..."
                  className="px-4 py-2 rounded-xl border border-slate-300 text-sm w-full sm:w-80"
                />
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0A192F] text-white">
                    <tr>
                      <th className="p-3">Matrícula</th>
                      <th className="p-3">Nome Completo</th>
                      <th className="p-3">Curso Atual (Cód. / Nome)</th>
                      <th className="p-3">ID Permanente do Curso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {students.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold">{s.registration_number}</td>
                        <td className="p-3 font-bold text-[#0A192F]">{s.full_name}</td>
                        <td className="p-3">
                          {s.courses?.course_code} - {s.courses?.name}
                        </td>
                        <td className="p-3 font-mono text-slate-400">{s.course_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'IMPORT_TXT' && (
          <StudentImportPanel onImportCompleted={loadAllAdminData} />
        )}

        {activeTab === 'COURSES' && (
          <div className="space-y-6">
            <form
              onSubmit={handleCreateCourse}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
            >
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Código Numérico (Importação TXT)
                </label>
                <input
                  type="number"
                  required
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  placeholder="Ex: 5"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Nome do Curso
                </label>
                <input
                  type="text"
                  required
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="Ex: NR-10 SEGURANÇA EM ELETRICIDADE"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <button
                type="submit"
                className="py-2.5 px-5 rounded-xl bg-[#0A192F] text-white font-bold text-sm hover:bg-[#112240]"
              >
                Adicionar Curso
              </button>
            </form>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold text-[#0A192F] mb-3">
                Gerenciar Cursos e Códigos (Item 5.1)
              </h2>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0A192F] text-white">
                    <tr>
                      <th className="p-3">Código Numérico</th>
                      <th className="p-3">Curso</th>
                      <th className="p-3">ID Interno Permanente (UUID)</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {courses.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-extrabold text-sm text-[#FF6B00]">
                          {c.course_code}
                        </td>
                        <td className="p-3 font-bold text-[#0A192F]">{c.name}</td>
                        <td className="p-3 font-mono text-slate-500">{c.id}</td>
                        <td className="p-3 font-bold">
                          {c.is_active ? '✅ Ativo' : '🚫 Inativo'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'TEACHERS' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-[#0A192F]">
              Professores e Vínculos de Turmas (Item 4.2)
            </h2>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0A192F] text-white">
                  <tr>
                    <th className="p-3">Nome Completo</th>
                    <th className="p-3">Usuário</th>
                    <th className="p-3">E-mail</th>
                    <th className="p-3">Turmas Vinculadas</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {teachers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-[#0A192F]">{t.full_name}</td>
                      <td className="p-3 font-mono">{t.username}</td>
                      <td className="p-3">{t.email}</td>
                      <td className="p-3">
                        {(t.assignedClasses || []).map((cl: any) => cl?.name).join(', ') || 'Nenhuma turma'}
                      </td>
                      <td className="p-3 font-bold">
                        {t.is_active ? '✅ Ativo' : '🔒 Bloqueado'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'BACKUPS' && (
          <BackupAndExportPanel executions={backups} />
        )}
      </main>
    </div>
  );
}
