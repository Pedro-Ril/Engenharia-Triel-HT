"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/Button";

/*
 * Os cards da Engenharia Versátil mostram só o resumo (números e ações);
 * listas e tabelas ficam recolhidas atrás deste botão.
 */
export function BotaoDetalhes({ aberto, onAlternar, quantidade }: { aberto: boolean; onAlternar: () => void; quantidade?: number }) {
  return (
    <Button variant="secondary" onClick={onAlternar} aria-expanded={aberto}>
      {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      {aberto ? "Ocultar detalhes" : `Ver detalhes${quantidade !== undefined ? ` (${quantidade})` : ""}`}
    </Button>
  );
}
