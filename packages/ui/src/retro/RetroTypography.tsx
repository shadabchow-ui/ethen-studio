import { cn } from "../lib/utils";

export function RetroHeading({
  as: Tag = "h2",
  className,
  ...props
}: React.ComponentPropsWithoutRef<"h1"> & { as?: "h1" | "h2" | "h3" | "h4" }) {
  return (
    <Tag
      className={cn("font-tiempos-headline leading-none tracking-[-0.01em] text-black", className)}
      {...props}
    />
  );
}

export function RetroMeta({ className, ...props }: React.ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn("font-mono text-[10px] uppercase tracking-[0.16em] text-black/55", className)}
      {...props}
    />
  );
}
