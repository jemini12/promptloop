import Link from "next/link";
import { ReactNode } from "react";
import type { LinkProps as NextLinkProps } from "next/link";

export type LinkButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type LinkButtonSize = "sm" | "md" | "lg";

export interface LinkButtonProps extends NextLinkProps {
  variant?: LinkButtonVariant;
  size?: LinkButtonSize;
  children: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
}

// EXACT same styles as Button - this is critical for consistency
const variantStyles: Record<LinkButtonVariant, string> = {
  primary:
    "inline-flex items-center justify-center rounded-md border border-transparent bg-zinc-900 text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2",
  secondary:
    "inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2",
  ghost:
    "inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2",
  danger:
    "inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2",
};

// EXACT same sizes as Button - this is critical for consistency
const sizeStyles: Record<LinkButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs font-medium",
  md: "px-4 py-2 text-sm font-medium",
  lg: "px-5 py-2.5 text-base font-medium",
};

export function LinkButton({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...props
}: LinkButtonProps) {
  const baseClasses = "transition-colors";
  const classes = [baseClasses, variantStyles[variant], sizeStyles[size], className]
    .filter(Boolean)
    .join(" ");

  return (
    <Link className={classes} {...props}>
      {children}
    </Link>
  );
}
