import Link from "next/link";
import type { StudioQuickLaunchItem } from "./studio-home-data";
import { QUICK_LAUNCH_ITEMS } from "./studio-home-data";

function QuickLaunchIcon({ icon }: { icon: StudioQuickLaunchItem["icon"] }) {
  if (icon === "image") {
    return <path d="M3 3h18v18H3zM8.5 8.5h.01M21 15l-5-5L5 21" />;
  }
  if (icon === "video") {
    return <><rect x="2.5" y="5" width="14" height="14" rx="3" /><path d="m16.5 9.5 5-3v11l-5-3" /></>;
  }
  if (icon === "link") {
    return <><path d="M9 15 15 9" /><path d="M11 6.5 13 4.5a4 4 0 0 1 6 6l-2 2" /><path d="M13 17.5 11 19.5a4 4 0 0 1-6-6l2-2" /></>;
  }
  if (icon === "person") {
    return <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>;
  }
  if (icon === "grid") {
    return <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>;
  }
  if (icon === "box") {
    return <><path d="M12 2 21 7v10l-9 5-9-5V7z" /><path d="m3 7 9 5 9-5M12 12v10" /></>;
  }
  if (icon === "audio") {
    return <><path d="M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></>;
  }
  return <><rect x="2.5" y="4" width="19" height="16" rx="2.5" /><path d="M7 4v16M17 4v16M2.5 9h4.5M17 9h4.5M2.5 15h4.5M17 15h4.5" /></>;
}

export function StudioQuickLaunch() {
  return (
    <section className="space-y-4">
      <h2 className="text-[18px] tracking-[-0.01em] text-[var(--text-primary)]">Quick Launch</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_LAUNCH_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="block rounded-[14px] ethen-panel-smoked px-4 py-[18px] transition-colors hover:border-[var(--border-strong)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[var(--text-secondary)]" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <QuickLaunchIcon icon={item.icon} />
            </svg>
            <p className="mt-3 text-[13.5px] font-medium text-[var(--text-primary)]">{item.title}</p>
            <p className="mt-1 text-[11.5px] text-[var(--text-secondary)]">{item.subtitle}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
