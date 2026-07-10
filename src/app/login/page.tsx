import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from './LoginForm';
import { sanitizeAdminRedirect } from '@/lib/auth-redirect.ts';
import { createSupabaseUserServerClient } from '@/lib/supabase/auth-server.ts';
import { hasSupabaseAuthConfig } from '@/lib/supabase/server.ts';

interface LoginPageProps {
  searchParams: Promise<{
    redirectTo?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirectTo: rawRedirectTo } = await searchParams;
  const redirectTo = sanitizeAdminRedirect(rawRedirectTo);

  if (hasSupabaseAuthConfig()) {
    const supabase = await createSupabaseUserServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect(redirectTo);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 py-10 text-zinc-950">
      <section className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <p className="text-sm font-black uppercase tracking-[0.22em] text-red-600">HITRACE60 Admin</p>
        <h1 className="mt-3 text-4xl font-black">Accesso organizzatore</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-500">
          Inserisci le credenziali Supabase Auth per gestire edizioni, timeline, partecipanti e link gara.
        </p>

        {!hasSupabaseAuthConfig() ? (
          <div className="mt-5 rounded-md bg-amber-50 p-3 text-sm font-bold text-amber-900">
            Supabase Auth non e configurato. In development puoi ancora usare il fallback demo, ma in produzione l&apos;admin resta
            bloccato.
          </div>
        ) : null}

        <LoginForm redirectTo={redirectTo} />

        <Link className="mt-5 inline-block text-sm font-black text-zinc-500 hover:text-zinc-950" href="/">
          Torna alla home pubblica
        </Link>
      </section>
    </main>
  );
}
