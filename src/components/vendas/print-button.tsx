"use client";
import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton({ auto = false, label = "Imprimir" }: { auto?: boolean; label?: string }) {
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <Button variant="secondary" onClick={() => window.print()} className="no-print">
      <Printer className="size-4" /> {label}
    </Button>
  );
}
