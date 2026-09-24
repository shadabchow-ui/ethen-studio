import { cn } from "../lib/utils";

export function RetroPage({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div className={cn("w-full px-4 py-4 md:px-6 md:py-6", className)} {...props} />;
}

export function RetroPanel({
  shadow = true,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { shadow?: boolean }) {
  return (
    <div
      className={cn(
        "border-2 border-black bg-white",
        shadow && "shadow-[6px_6px_0_rgba(0,0,0,0.18)]",
        className,
      )}
      {...props}
    />
  );
}

export function RetroSection({ className, ...props }: React.ComponentPropsWithoutRef<"section">) {
  return <section className={cn("border-x-2 border-b-2 border-black bg-white px-4 py-4", className)} {...props} />;
}

export function RetroDivider({ className, ...props }: React.ComponentPropsWithoutRef<"hr">) {
  return <hr className={cn("border-0 border-t-2 border-black", className)} {...props} />;
}
