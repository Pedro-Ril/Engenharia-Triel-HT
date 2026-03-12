import { Suspense } from "react";
import ConsultaEstruturaClient from "./ConsultaEstruturaClient";

export default function ConsultaEstruturaPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Carregando consulta...</div>}>
      <ConsultaEstruturaClient />
    </Suspense>
  );
}