import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getExamView } from '@/app/actions/examen';
import ExamRunner from './ExamRunner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Examen en cours | Tuina.ai' };

export default async function ExamSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const res = await getExamView(sessionId);
  if ('error' in res || !res.view) redirect('/app/examen');
  return <ExamRunner sessionId={sessionId} initialView={res.view} />;
}
