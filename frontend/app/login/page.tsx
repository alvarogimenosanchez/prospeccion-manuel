"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function loginConGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 w-full max-w-sm text-center space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-md">
            M
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Manuel · Prospección</h1>
            <p className="text-sm text-slate-500 mt-0.5">Sistema de gestión comercial</p>
          </div>
        </div>

        {/* Error */}
        {error === "no_autorizado" && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            Tu cuenta de Google no está autorizada para acceder. Contacta con el administrador.
          </div>
        )}

        {/* Botón Google */}
        <button
          onClick={loginConGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {loading ? (
            <svg className="animate-spin w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {loading ? "Redirigiendo..." : "Continuar con Google"}
        </button>

        <p className="text-xs text-slate-400">
          Acceso restringido a comerciales autorizados
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
