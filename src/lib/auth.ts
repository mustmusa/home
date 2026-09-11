import { SignJWT, jwtVerify } from "jose";
import type { SessionPayload } from "./types";

export const SESSION_COOKIE = "session";
const ALG = "HS256";

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("متغير البيئة SESSION_SECRET غير مضبوط");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(secretKey());
}

export async function verifySession(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.uid === "string" &&
      typeof payload.name === "string" &&
      typeof payload.role === "string"
    ) {
      return {
        uid: payload.uid,
        name: payload.name,
        role: payload.role as SessionPayload["role"],
        houseId: (payload.houseId as string | null) ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const homePathForRole: Record<SessionPayload["role"], string> = {
  wife: "/wife",
  warehouse: "/warehouse",
  admin: "/admin",
};
