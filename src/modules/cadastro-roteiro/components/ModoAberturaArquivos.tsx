"use client";

import { createContext, useContext, type ReactNode } from "react";

import {
  MODO_ABERTURA_PADRAO,
  type ModoAberturaArquivos,
} from "../constants/abertura-arquivos";

/*
 * Os botões de PDF e 3D aparecem em cada linha da árvore (que é
 * recursiva) e dentro do modal de cadastro. Contexto em vez de passar a
 * preferência de mão em mão por todos esses níveis.
 *
 * Fora do provider vale o padrão -- o botão continua funcionando, só
 * abre em aba como sempre.
 */
const ModoAberturaContext = createContext<ModoAberturaArquivos>(MODO_ABERTURA_PADRAO);

export function ModoAberturaProvider({
  modo,
  children,
}: {
  modo: ModoAberturaArquivos;
  children: ReactNode;
}) {
  return <ModoAberturaContext.Provider value={modo}>{children}</ModoAberturaContext.Provider>;
}

export function useModoAbertura(): ModoAberturaArquivos {
  return useContext(ModoAberturaContext);
}
