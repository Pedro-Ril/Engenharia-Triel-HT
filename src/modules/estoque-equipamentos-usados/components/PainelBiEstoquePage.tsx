"use client";

import { buscarPainelBiEstoque } from "../services/estoque.service";
import {
  CabecalhoPainel,
  EstadoPainel,
  MolduraEscalavel,
  PaginaQuantidade,
  usePainelDados,
  usePainelTv,
} from "./PainelBiPartes";
import styles from "./PainelBiEstoquePage.module.css";

/* Painel de BI de Equipamentos Usados para TV: uma página, quantidades (ver PainelBiPartes). */
export function PainelBiEstoquePage() {
  const tv = usePainelTv();
  const { dados, erro } = usePainelDados(buscarPainelBiEstoque);

  if (!dados) return <EstadoPainel erro={erro} />;

  return (
    <MolduraEscalavel>
      <div className={styles.painel}>
        <CabecalhoPainel tv={tv} subtitulo="Estoque de Equipamentos Usados" />
        <PaginaQuantidade dados={dados} />
      </div>
    </MolduraEscalavel>
  );
}
