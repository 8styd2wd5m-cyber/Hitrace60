'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState, useTransition } from 'react';
import { loginAdminAction } from './actions';

interface LoginFormProps {
  redirectTo: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await loginAdminAction({
        email,
        password,
        redirectTo,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(result.redirectTo);
      router.refresh();
    });
  }

  return (
    <form className="mt-8 grid gap-4" onSubmit={submit}>
      <label className="grid gap-2 text-sm font-black text-zinc-700">
        Email admin
        <input
          autoComplete="email"
          className="h-12 rounded-md border border-zinc-300 px-3 font-semibold outline-none focus:border-red-600"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@hitrace60.it"
          type="email"
          value={email}
        />
      </label>

      <label className="grid gap-2 text-sm font-black text-zinc-700">
        Password
        <input
          autoComplete="current-password"
          className="h-12 rounded-md border border-zinc-300 px-3 font-semibold outline-none focus:border-red-600"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          type="password"
          value={password}
        />
      </label>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

      <button
        className="h-12 rounded-md bg-red-600 font-black text-white transition hover:bg-red-700 disabled:cursor-wait disabled:bg-zinc-300"
        disabled={isPending}
        type="submit"
      >
        {isPending ? 'Accesso...' : 'Entra nel pannello admin'}
      </button>
    </form>
  );
}
