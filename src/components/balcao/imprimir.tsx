"use client";
import { useState } from "react";
import { Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function BotaoImprimir() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer className="size-4" /> Imprimir
    </Button>
  );
}

export function BotaoCopiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          setOk(false);
        }
      }}
    >
      <Copy className="size-4" /> {ok ? "Copiado!" : "Copiar texto"}
    </Button>
  );
}
