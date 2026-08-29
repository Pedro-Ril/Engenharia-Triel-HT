import { Monitor, Moon, Sun } from "lucide-react";

import type { RadioOption } from "@/components/ui/RadioGroup";

/*
 * Opções do RadioGroup de tema (claro/escuro/sistema) — compartilhadas
 * entre Minha Conta > Aparência e o atalho de acesso rápido na home,
 * pra não duplicar rótulos/descrições em dois lugares.
 */
export const OPCOES_TEMA: RadioOption[] = [
  {
    value: "claro",
    label: "Claro",
    description: "Fundo claro, sempre.",
    icon: <Sun size={17} />,
  },
  {
    value: "escuro",
    label: "Escuro",
    description: "Fundo escuro, sempre.",
    icon: <Moon size={17} />,
  },
  {
    value: "sistema",
    label: "Sistema",
    description: "Segue o tema do seu dispositivo.",
    icon: <Monitor size={17} />,
  },
];
