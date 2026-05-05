import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  component: RootLayout
});

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-1.5 text-sm transition-colors"
      activeProps={{ className: "font-medium text-primary" }}
      inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
    >
      {children}
    </Link>
  );
}

function RootLayout() {
  return (
    <div className="flex h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-md"
      >
        Skip to content
      </a>

      <header className="h-12 shrink-0 border-b bg-background">
        <nav className="flex h-full items-center gap-0.5 px-6" aria-label="Main navigation">
          <span className="mr-5 text-sm font-semibold tracking-tight">Personal P&amp;L</span>
          <NavLink to="/upload">Upload</NavLink>
          <NavLink to="/categorize">Categorize</NavLink>
          <NavLink to="/pnl">P&amp;L</NavLink>
          <NavLink to="/tags">Tags</NavLink>
        </nav>
      </header>

      <div id="main-content" className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>

      <Toaster />
    </div>
  );
}
