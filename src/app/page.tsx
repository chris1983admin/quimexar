"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";
import { calculateSellerStock } from "@/lib/stock"; 

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <Icons.logo className="h-12 w-12 animate-pulse text-primary" />
        <h1 className="text-2xl font-bold">Cargando...</h1>
        <p className="text-muted-foreground">Redirigiendo al dashboard.</p>
      </div>
    </div>
  );
}
