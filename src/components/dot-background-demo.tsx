import { cn } from "@/lib/utils";
import React from "react";

export default function DotBackgroundDemo() {
  return (
    <div className="fixed inset-x-0 top-0 flex h-dvh w-full items-center justify-center bg-white dark:bg-[#0a0a0a]">
      <div
        className={cn("absolute inset-0", "[background-size:20px_20px]")}
        /* The dots carry the accent, so the plainest wallpaper still follows the theme. */
        style={{ backgroundImage: "radial-gradient(rgba(var(--accent-rgb), 0.28) 1px, transparent 1px)" }}
      />
      {/* Radial gradient for the container to give a faded look */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-[#0a0a0a]"></div>
    </div>
  );
}
