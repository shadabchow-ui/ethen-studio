import { cn } from "../lib/utils";

export function RetroDialogSurface({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "border-2 border-black bg-white shadow-[6px_6px_0_rgba(0,0,0,0.18)]",
        className,
      )}
      {...props}
    />
  );
}
