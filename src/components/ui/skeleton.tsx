import { cn } from "@/lib/utils"

function Skeleton({
  className,
  tone,
  ...props
}: React.ComponentProps<"div"> & { tone?: "default" | "cream" }) {
  return (
    <div
      data-slot="skeleton"
      data-tone={tone}
      className={cn(
        "animate-pulse rounded-md bg-muted",
        tone === "cream" && "bg-cream",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
