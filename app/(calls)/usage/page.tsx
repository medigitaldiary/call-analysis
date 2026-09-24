import UsageDashboard from '@/components/calls/UsageDashboard';

export default function UsagePage() {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, overflow: 'clip' }}>
      <UsageDashboard />
    </div>
  );
}
