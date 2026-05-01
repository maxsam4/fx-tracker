import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  if (await isAuthenticated()) {
    redirect(searchParams.next ?? '/alerts');
  }
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-xl font-semibold">Admin login</h1>
      <form
        action="/alerts/api/login"
        method="POST"
        className="space-y-3 rounded-md border border-edge bg-surface p-4"
      >
        <input type="hidden" name="next" value={searchParams.next ?? '/alerts'} />
        <label className="block text-sm">
          <span className="text-muted">Password</span>
          <input
            type="password"
            name="password"
            required
            autoFocus
            className="mt-1 w-full rounded border border-edge bg-bg px-2 py-1 font-mono"
          />
        </label>
        {searchParams.error && (
          <p className="text-sm text-bad">{searchParams.error}</p>
        )}
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1 text-sm font-medium text-bg"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
