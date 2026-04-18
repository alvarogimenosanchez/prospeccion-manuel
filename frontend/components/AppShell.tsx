"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sidebar } from "./Sidebar";

const PUBLIC_ROUTES = ["/login", "/auth"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
  if (isPublic) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-full w-56 transition-transform duration-200 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-20 h-12 bg-[#0D1117] border-b border-white/5 flex items-center justify-between px-4 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <span className="text-white text-sm font-semibold" style={{ fontFamily: "var(--font-heading)" }}>Manuel</span>
        <div className="w-7" />
      </div>

      {/* Main content */}
      <main className="flex-1 min-w-0 md:ml-56 pt-12 md:pt-0 min-h-screen">
        <div className="px-4 sm:px-6 py-6 max-w-[1400px]">
          {children}
        </div>
      </main>
    </div>
  );
}
