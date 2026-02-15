"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Missions" },
  { href: "/my-missions", label: "My Missions" },
  { href: "/exchange", label: "Exchange" },
  { href: "/profile", label: "Profile" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-black/5 bg-fg-sand/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-display text-xl tracking-tight text-fg-ink">
          FORGOOD
        </Link>

        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.15em] transition ${
                  active
                    ? "bg-fg-ink text-fg-sand"
                    : "text-black/60 hover:bg-black/5 hover:text-fg-ink"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
