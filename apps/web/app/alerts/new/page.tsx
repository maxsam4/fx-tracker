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
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">New alert rule</h1>
      <AlertForm pairs={pairs} />
    </div>
  );
}
