"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "inline-flex items-center justify-center rounded-md border border-transparent bg-zinc-900 text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2",
  secondary:
    "inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2",
  ghost:
    "inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2",
  danger:
    "inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs font-medium",
  md: "px-4 py-2 text-sm font-medium",
  lg: "px-5 py-2.5 text-base font-medium",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  children,
  className = "",
  ...props
}: ButtonProps) {
  const baseClasses = "transition-colors disabled:opacity-50 disabled:pointer-events-none";
  const classes = [baseClasses, variantStyles[variant], sizeStyles[size], className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={classes}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
