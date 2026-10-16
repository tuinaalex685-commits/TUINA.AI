import React, { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import SignupFlow from './SignupFlow';

export const metadata = {
  title: 'Créer un compte | SJP',
};

export default function InscriptionPage() {
  return (
    <AuthShell>
      {/* useSearchParams (niveau présélectionné depuis la page d'accueil) exige une frontière Suspense. */}
      <Suspense fallback={null}>
        <SignupFlow />
      </Suspense>
    </AuthShell>
  );
}
