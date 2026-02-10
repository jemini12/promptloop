"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

function navItemClass(active: boolean) {
  return active
    ? "inline-flex items-center text-sm font-medium text-zinc-900"
    : "inline-flex items-center text-sm text-zinc-600 transition-colors hover:text-zinc-900";
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-[color:var(--bg-soft)]/92 backdrop-blur">
      <div className="content-shell flex flex-wrap items-center justify-between gap-2 py-3">
        <Link href="/" className="inline-flex items-center text-lg font-semibold text-zinc-900">
          Promptly
        </Link>

        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <nav className="inline-flex items-center gap-4" aria-label="Primary">
            <Link
              href="/help"
              className={navItemClass(isActivePath(pathname, "/help"))}
              aria-current={isActivePath(pathname, "/help") ? "page" : undefined}
            >
              Help
            </Link>
            {signedIn ? (
              <Link
                href="/dashboard"
                className={navItemClass(isActivePath(pathname, "/dashboard"))}
                aria-current={isActivePath(pathname, "/dashboard") ? "page" : undefined}
              >
                Dashboard
              </Link>
            ) : null}

            {!signedIn ? (
              <Link href="/signin"
                className={navItemClass(isActivePath(pathname, "/signin"))}
                aria-current={isActivePath(pathname, "/signin") ? "page" : undefined}
              >
                Sign in
              </Link>
            ) : null}
            {signedIn ? (
              <Link
                href="/signout"
                className={navItemClass(isActivePath(pathname, "/signout"))}
                aria-current={isActivePath(pathname, "/signout") ? "page" : undefined}
              >
                Sign out
              </Link>
            ) : null}
          </nav>
        </div>
      </div>
    </header>
  );
}
