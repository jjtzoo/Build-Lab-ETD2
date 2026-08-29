import Link from "next/link";
import type { Route } from "next";

const navigation: {
  label: string;
  href: Route;
}[] = [
  { label: "Build Lab", href: "/" },
  { label: "What If", href: "/what-if" },
  { label: "Allocation Explorer", href: "/allocations" },
  { label: "Core Explorer", href: "/cores" },
  { label: "Tower Codex", href: "/towers" },
  { label: "Research", href: "/research" },
  { label: "Debug", href: "/debug" },
];

export function Navigation() {
  return (
    <nav className="nav">
      {navigation.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}