import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { loadProvidersConfig } from '@fx/core/config';
import { AlertForm } from '@/components/AlertForm';

export default async function NewAlertPage() {
  if (!(await isAuthenticated())) redirect('/alerts/login?next=/alerts/new');
  const config = loadProvidersConfig();
  const pairs = Object.entries(config.pairs)
    .filter(([, c]) => c.enabled)
    .map(([key, c]) => ({ key, referenceAmounts: c.referenceAmounts }));

  return (
    <div className="stagger mx-auto max-w-lg space-y-6">
      <div>
        <Link
          href="/alerts"
          className="text-2xs uppercase tracking-[0.16em] text-subtle hover:text-text"
        >
          ← Alerts
        </Link>
        <h1 className="mt-2 font-display text-3xl italic tracking-tight text-text">
          New rule
        </h1>
        <p className="mt-1 text-sm text-muted">
          Threshold rules fire on edge-cross; interval rules digest every N seconds.
        </p>
      </div>
      <AlertForm pairs={pairs} />
    </div>
  );
}
