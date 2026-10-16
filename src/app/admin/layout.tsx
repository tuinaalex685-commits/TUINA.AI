import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/viewer';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AdminNav } from '@/components/admin/AdminNav';
import styles from '@/components/admin/admin.module.css';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Défense en profondeur : proxy.ts filtre déjà /admin, mais les pages d'administration lisent
  // les données avec le service role. Le rôle est donc revérifié ici, à chaque rendu.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { data: role } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
  if (role?.role !== 'admin') redirect('/app/dashboard');

  return (
    <div className={styles.shell}>
      <AdminNav />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
