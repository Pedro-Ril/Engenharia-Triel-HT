"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

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

/* Painel de BI do estoque de equipamentos para TV: uma página, quantidades (ver PainelBiPartes). ?condicao=novo mostra os novos. */
export function PainelBiEstoquePage() {
  const tv = usePainelTv();
  const novos = useSearchParams().get("condicao") === "novo";
  const buscar = useCallback(() => buscarPainelBiEstoque(novos ? "novo" : "usado"), [novos]);
  const { dados, erro } = usePainelDados(buscar);

  if (!dados) return <EstadoPainel erro={erro} />;

  return (
    <MolduraEscalavel>
      <div className={styles.painel}>
        <CabecalhoPainel tv={tv} subtitulo={novos ? "Estoque de Equipamentos Novos" : "Estoque de Equipamentos Usados"} />
        <PaginaQuantidade dados={dados} />
      </div>
    </MolduraEscalavel>
  );
}
