import { Suspense } from "react";
import CadastroRoteiro from "./CadastroRoteiro";

export default function CadastroRoteiroPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Carregando cadastro de roteiro...</div>}>
      <CadastroRoteiro />
    </Suspense>
  );
}