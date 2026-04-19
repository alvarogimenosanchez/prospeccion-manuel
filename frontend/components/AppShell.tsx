"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { PermisosProvider } from "./PermisosProvider";

const PUBLIC_ROUTES = ["/login", "/auth"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
  if (isPublic) return <>{children}</>;

  return (
    <PermisosProvider>
    <div className="flex min-h-screen" style={{ background: "#f1edeb" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-full w-56
          transition-transform duration-200 ease-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 md:[transform:none]`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Mobile top bar */}
      <div
        className="fixed top-0 left-0 right-0 z-20 h-12 flex items-center justify-between px-4 md:hidden"
        style={{ background: "#ffffff", borderBottom: "1px solid #e5ded9" }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded transition-colors"
          style={{ color: "#414141" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <span className="text-sm font-semibold" style={{ color: "#414141" }}>Manuel · CRM</span>
        <div className="w-7" />
      </div>

      {/* Main content */}
      <main
        className="flex-1 min-w-0 md:ml-56 pt-12 md:pt-0 min-h-screen"
        style={{ minWidth: 0 }}
      >
        <div style={{ width: "100%", padding: "24px 16px", maxWidth: 1400 }}>
          {children}
        </div>
      </main>
    </div>
    </PermisosProvider>
  );
}
