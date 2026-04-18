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
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="min-h-screen flex" style={{ background: "#f1edeb" }}>
      {/* Left — branding panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-[440px] shrink-0 px-10 py-12"
        style={{ background: "#ffffff", borderRight: "1px solid #e5ded9" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center text-white font-bold text-sm"
            style={{ background: "#ea650d", borderRadius: "4px" }}
          >
            NN
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: "#414141" }}>
              Nationale-Nederlanden
            </p>
            <p className="text-xs" style={{ color: "#a09890" }}>Prospección Comercial</p>
          </div>
        </div>

        {/* Central message */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-normal leading-tight" style={{ color: "#414141" }}>
              Tu sistema de<br />
              <span style={{ color: "#ea650d" }}>prospección inteligente</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "#6b6560", lineHeight: "22px" }}>
              Gestiona leads, automatiza el seguimiento y cierra más operaciones con ayuda de IA.
            </p>
          </div>

          <div className="space-y-3.5">
            {[
              { icon: "🎯", text: "Cola diaria priorizada automáticamente" },
              { icon: "🤖", text: "Mensajes personalizados generados con IA" },
              { icon: "📊", text: "Métricas de desempeño en tiempo real" },
              { icon: "📱", text: "Envío directo por WhatsApp integrado" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <span className="text-base w-5 text-center shrink-0">{icon}</span>
                <span className="text-sm" style={{ color: "#6b6560" }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs" style={{ color: "#c7bdb7" }}>
          © 2026 Nationale-Nederlanden España · Manuel CRM
        </p>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-7">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3">
            <div
              className="w-9 h-9 flex items-center justify-center text-white font-bold text-sm"
              style={{ background: "#ea650d", borderRadius: "4px" }}
            >
              NN
            </div>
            <span className="font-semibold text-sm" style={{ color: "#414141" }}>
              Manuel · CRM
            </span>
          </div>

          {/* Heading */}
          <div>
            <h2 className="text-2xl font-normal" style={{ color: "#414141" }}>
              Iniciar sesión
            </h2>
            <p className="text-sm mt-1" style={{ color: "#a09890" }}>
              Accede con tu cuenta de Google autorizada
            </p>
          </div>

          {/* Error */}
          {error === "no_autorizado" && (
            <div
              className="rounded px-4 py-3 text-sm"
              style={{
                background: "#fff5f0",
                border: "1px solid #f5c5a8",
                color: "#c0400a",
                borderRadius: "4px",
              }}
            >
              Tu cuenta de Google no está autorizada. Contacta con el administrador.
            </div>
          )}

          {/* Google button */}
          <button
            onClick={loginConGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 text-sm font-medium transition-all disabled:opacity-50"
            style={{
              background: "#ffffff",
              border: "1px solid #e5ded9",
              borderRadius: "4px",
              color: "#414141",
              boxShadow: "0 2px 8px rgba(102,102,102,0.08)",
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = "#faf8f6")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
          >
            {loading ? (
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none"
                stroke="#ea650d" strokeWidth="2">
                <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                <path className="opacity-75" fill="#ea650d" d="M4 12a8 8 0 018-8v8H4z" />
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

          {/* Primary CTA — orange style */}
          <div
            className="h-px w-full"
            style={{ background: "#e5ded9" }}
          />

          <p className="text-center text-xs" style={{ color: "#c7bdb7" }}>
            Acceso restringido a comerciales autorizados de Nationale-Nederlanden
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
