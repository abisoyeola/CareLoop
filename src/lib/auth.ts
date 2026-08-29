import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { Role } from "./models";

const COOKIE = "careloop_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "JWT_SECRET is missing or too short. Set a random 32+ character value in .env",
    );
  }
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function checkPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function readToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.userId || !payload.role) return null;
    return {
      userId: String(payload.userId),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(session: Session) {
  const jar = await cookies();
  jar.set(COOKIE, await signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return readToken(token);
}

export const SESSION_COOKIE = COOKIE;

/** Route-handler guard. Throws a 401/403-shaped error the handler converts. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthError("Not signed in", 401);
  return s;
}

export async function requireRole(...roles: Role[]): Promise<Session> {
  const s = await requireSession();
  if (!roles.includes(s.role)) {
    throw new AuthError(`This action requires the ${roles.join(" or ")} role`, 403);
  }
  return s;
}
