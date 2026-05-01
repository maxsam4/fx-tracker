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
    <div className="mx-auto flex max-w-sm flex-col items-center pt-12">
      <div className="mb-6 text-center">
        <p className="text-2xs uppercase tracking-[0.16em] text-subtle">Restricted</p>
        <h1 className="mt-1 font-display text-3xl italic tracking-tight text-text">
          Admin login
        </h1>
        <p className="mt-1 text-xs text-muted">Required to manage alert rules.</p>
      </div>

      <form
        action="/alerts/api/login"
        method="POST"
        className="w-full space-y-4 rounded-md border border-edge bg-surface p-5"
      >
        <input type="hidden" name="next" value={searchParams.next ?? '/alerts'} />
        <label className="block">
          <span className="text-2xs font-medium uppercase tracking-[0.14em] text-subtle">
            Password
          </span>
          <input
            type="password"
            name="password"
            required
            autoFocus
            className="mt-2 w-full rounded border border-edge bg-bg px-3 py-2 font-mono text-sm text-text placeholder:text-subtle focus:border-edge-strong"
          />
        </label>
        {searchParams.error && (
          <p className="rounded border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
            {searchParams.error}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-md border border-accent/40 bg-accent/15 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent/25"
        >
          Sign in →
        </button>
      </form>
    </div>
  );
}
