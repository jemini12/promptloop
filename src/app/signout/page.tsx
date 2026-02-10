"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function SignOutPage() {
    useEffect(() => {
        void signOut({ callbackUrl: "/" });
    }, []);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <p className="text-zinc-500 text-sm animate-pulse">Signing out...</p>
        </div>
    );
}
