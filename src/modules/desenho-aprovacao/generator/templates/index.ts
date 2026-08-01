import { siloGraneleiroLateralSvg } from "./silo-graneleiro/lateral";
import { siloGraneleiroSuperiorSvg } from "./silo-graneleiro/superior";

export type ApprovalTemplateProduct =
  | "Silo Graneleiro"
  | "Aves"
  | "Suinos";

export type ApprovalTemplateView =
  | "lateral"
  | "superior";

export interface ApprovalTemplateArtwork {
  lateral: string;
  superior: string;
}

export function getApprovalTemplateArtwork(
  produto: string | null | undefined
): ApprovalTemplateArtwork {
  switch ((produto ?? "").trim()) {
    case "Silo Graneleiro":
      return {
        lateral: siloGraneleiroLateralSvg,
        superior: siloGraneleiroSuperiorSvg,
      };

    /*
     * Quando for adicionar os próximos produtos,
     * basta repetir a lógica aqui.
     */
    case "Aves":
    case "Suinos":
    default:
      return {
        lateral: siloGraneleiroLateralSvg,
        superior: siloGraneleiroSuperiorSvg,
      };
  }
}