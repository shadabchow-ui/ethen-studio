// RECONSTRUCTED ETHEN V2 SOURCE
// ORIGINAL FILE WAS NOT FULLY RECOVERABLE
// DO NOT REPRESENT THIS FILE AS FORENSICALLY RECOVERED SOURCE

import * as React from "react";
import { cn } from "@ethen/ui/lib/utils";
export interface NavRowItem { id: string; label: string; href?: string; icon?: React.ReactNode; active?: boolean; disabled?: boolean; disabledReason?: string; }
export function NavRow({ item, collapsed = false }: { item: NavRowItem; collapsed?: boolean }) { const body = <><span className="grid h-4 w-4 shrink-0 place-items-center">{item.icon}</span>{collapsed ? null : <span className="truncate">{item.label}</span>}</>; const classes = cn("flex h-9 items-center gap-2 rounded-[var(--v2-radius-base)] px-2 text-[13px]", item.active ? "bg-[var(--v2-active)] text-[var(--v2-text-primary)]" : "text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)]", item.disabled && "pointer-events-none opacity-50"); return item.href && !item.disabled ? <a href={item.href} className={classes} aria-current={item.active ? "page" : undefined} aria-label={item.label}>{body}</a> : <div className={classes} aria-disabled={item.disabled} title={item.disabledReason}>{body}</div>; }
