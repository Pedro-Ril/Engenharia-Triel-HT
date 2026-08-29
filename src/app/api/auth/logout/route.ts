import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST() {
  const response = NextResponse.json({
    ok: true,
    message: "Sessão encerrada.",
  });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export const POST = comMetricasApi("auth/logout", handlePOST);
