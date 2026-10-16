// src/app/api/teacher/classes/route.ts
// Item 4.1: Retorna exclusivamente as turmas às quais o professor autenticado foi vinculado pela escola
import 'server-only';
import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedSession } from '@/lib/auth/guard';

export async function GET() {
  const auth = await requireAuthenticatedSession();
  if (!auth.authorized) return auth.response!;

  const supabase = createAdminSupabaseClient();

  if (auth.role === 'ADMIN') {
    const { data: allClasses } = await supabase
      .from('classes')
      .select('id, code, name, shift, courses(id, course_code, name)')
      .eq('is_active', true)
      .order('name');
    return NextResponse.json({ classes: allClasses || [], profileName: auth.fullName });
  }

  const { data: links } = await supabase
    .from('teacher_classes')
    .select('class_id, classes(id, code, name, shift, is_active, courses(id, course_code, name))')
    .eq('teacher_id', auth.profileId);

  const assignedClasses = (links || [])
    .map((l: any) => l.classes)
    .filter((c: any) => c && c.is_active);

  return NextResponse.json({
    classes: assignedClasses,
    profileName: auth.fullName,
  });
}
