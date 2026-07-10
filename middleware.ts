import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { sanitizeAdminRedirect } from '@/lib/auth-redirect.ts';

type SupabaseCookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname.startsWith('/admin');
  const isLoginRoute = pathname === '/login';

  if (!isAdminRoute && !isLoginRoute) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return isAdminRoute ? redirectToLogin(request, `${pathname}${request.nextUrl.search}`, 'auth_config_missing') : NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isAdminRoute && !user) {
    return redirectToLogin(request, `${pathname}${request.nextUrl.search}`);
  }

  if (isLoginRoute && user) {
    const redirectTo = sanitizeAdminRedirect(request.nextUrl.searchParams.get('redirectTo'));
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  return response;
}

function redirectToLogin(request: NextRequest, redirectTo: string, error?: string) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirectTo', sanitizeAdminRedirect(redirectTo));
  if (error) {
    loginUrl.searchParams.set('error', error);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/login'],
};
