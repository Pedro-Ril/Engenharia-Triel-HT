import { redirect } from "next/navigation";

/* A Consulta última revisão virou uma aba do 3DExperience (permissão "3dexperience"). */
export default function Page() {
  redirect("/3dexperience?aba=ultima-revisao");
}
