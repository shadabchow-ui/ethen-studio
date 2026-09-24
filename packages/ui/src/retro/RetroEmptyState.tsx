import { cn } from "../lib/utils";

export function RetroEmptyState({
  title,
  description,
  action,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 border-[1.5px] border-dashed border-black/30 bg-white px-6 py-10 text-center",
        className,
      )}
      {...props}
    >
      <p className="font-tiempos-headline text-[18px] leading-none text-black">{title}</p>
      {description && <p className="max-w-[40ch] text-[13px] leading-6 text-black/58">{description}</p>}
      {action}
    </div>
  );
}
