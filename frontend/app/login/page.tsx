"use client";

export const dynamic = "force-dynamic";

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
    <div className="min-h-screen flex" style={{ background: "#080C14" }}>
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 px-10 py-12"
        style={{ background: "linear-gradient(160deg, #0D1117 0%, #111827 100%)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base"
            style={{ background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)" }}>
            M
          </div>
          <span className="text-white font-semibold text-base" style={{ fontFamily: "var(--font-heading)" }}>
            Manuel · CRM
          </span>
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white leading-tight" style={{ fontFamily: "var(--font-heading)" }}>
              Tu sistema de<br />
              <span style={{ background: "linear-gradient(90deg, #818CF8, #A78BFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                prospección comercial
              </span>
            </h1>
            <p className="mt-3 text-slate-500 text-sm leading-relaxed">
              Gestiona leads, automatiza seguimientos y cierra más operaciones con inteligencia artificial.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: "🎯", text: "Cola diaria priorizada automáticamente" },
              { icon: "🤖", text: "Mensajes personalizados con IA" },
              { icon: "📊", text: "Métricas de desempeño en tiempo real" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <span className="text-base">{icon}</span>
                <span className="text-slate-400 text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-700 text-xs">
          © 2026 Manuel · Prospección Comercial
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-7">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base"
              style={{ background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)" }}>
              M
            </div>
            <span className="text-white font-semibold text-base" style={{ fontFamily: "var(--font-heading)" }}>
              Manuel · CRM
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>
              Iniciar sesión
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Accede con tu cuenta de Google autorizada
            </p>
          </div>

          {error === "no_autorizado" && (
            <div className="rounded-xl px-4 py-3 text-sm"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#FCA5A5" }}>
              Tu cuenta de Google no está autorizada. Contacta con el administrador.
            </div>
          )}

          <button
            onClick={loginConGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#E2E8F0",
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
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
            <span>{loading ? "Redirigiendo..." : "Continuar con Google"}</span>
          </button>

          <p className="text-center text-xs text-slate-700">
            Acceso restringido a comerciales autorizados
          </p>
        </div>
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
