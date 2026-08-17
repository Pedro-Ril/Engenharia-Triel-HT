import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifySessionToken } from "./jwt";
import type { SessionPayload } from "./jwt";

export type { SessionPayload };

export async function getSessionUsuario(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}
