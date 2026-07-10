import Link from 'next/link';
import { logoutAdminAction } from './actions';
import { createSupabaseUserServerClient } from '@/lib/supabase/auth-server.ts';
import { hasSupabaseAuthConfig } from '@/lib/supabase/server.ts';

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const email = await loadSessionEmail();

  return (
    <>
      <div className="border-b border-zinc-200 bg-white px-5 py-3 text-zinc-950">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <Link className="text-sm font-black uppercase tracking-[0.18em] text-red-600" href="/admin/events">
              HITRACE60 Admin
            </Link>
            <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-black text-zinc-600">
              {email ? `Sessione: ${email}` : 'Development fallback'}
            </span>
          </div>
          <form action={logoutAdminAction}>
            <button className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-black text-white" type="submit">
              Esci
            </button>
          </form>
        </div>
      </div>
      {children}
    </>
  );
}

async function loadSessionEmail(): Promise<string | null> {
  if (!hasSupabaseAuthConfig()) {
    return null;
  }

  const supabase = await createSupabaseUserServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.email ?? null;
}
