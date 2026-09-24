import { cn } from "../lib/utils";

const fieldBase =
  "w-full rounded-none border-[1.5px] border-black bg-white px-3 py-2 text-[14px] text-black placeholder:text-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

export function RetroInput({ className, ...props }: React.ComponentPropsWithoutRef<"input">) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

export function RetroTextarea({ className, ...props }: React.ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cn(fieldBase, "resize-none", className)} {...props} />;
}

export function RetroSelect({ className, ...props }: React.ComponentPropsWithoutRef<"select">) {
  return <select className={cn(fieldBase, "appearance-none", className)} {...props} />;
}
