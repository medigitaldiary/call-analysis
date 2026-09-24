'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import CallMetaForm from '@/components/calls/CallMetaForm';

function SingleContent() {
  const searchParams = useSearchParams();
  const repEmail = searchParams.get('rep') ?? undefined;
  return <CallMetaForm repEmail={repEmail} />;
}

export default function SinglePage() {
  return (
    <Suspense fallback={<div style={{ background: '#0c1021', minHeight: '100vh' }} />}>
      <SingleContent />
    </Suspense>
  );
}
