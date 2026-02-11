import Link from "next/link";
import { ReactNode } from "react";
import type { LinkProps as NextLinkProps } from "next/link";
import { controlSizeStyles, controlVariantStyles, type ControlSize, type ControlVariant } from "@/components/ui/control-styles";

export type LinkButtonVariant = ControlVariant;
export type LinkButtonSize = ControlSize;

export interface LinkButtonProps extends NextLinkProps {
  variant?: LinkButtonVariant;
  size?: LinkButtonSize;
  children: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...props
}: LinkButtonProps) {
  const baseClasses = "transition-colors";
  const classes = [baseClasses, controlVariantStyles[variant], controlSizeStyles[size], className]
    .filter(Boolean)
    .join(" ");

  return (
    <Link className={classes} {...props}>
      {children}
    </Link>
  );
}
