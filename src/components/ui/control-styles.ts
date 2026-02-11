export type ControlVariant = "primary" | "secondary" | "ghost" | "danger";
export type ControlSize = "sm" | "md" | "lg";

export const controlVariantStyles: Record<ControlVariant, string> = {
  primary:
    "inline-flex items-center justify-center rounded-md border border-transparent bg-zinc-900 text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2",
  secondary:
    "inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2",
  ghost:
    "inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2",
  danger:
    "inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2",
};

export const controlSizeStyles: Record<ControlSize, string> = {
  sm: "px-3 py-1.5 !text-xs !leading-4 font-medium",
  md: "px-4 py-2 !text-sm !leading-5 font-medium",
  lg: "px-5 py-2.5 !text-base !leading-6 font-medium",
};
