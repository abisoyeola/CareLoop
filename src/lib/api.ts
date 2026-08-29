import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { connectDb } from "./db";
import { AuthError, requireRole } from "./auth";
import { AuditLog, User } from "./models";

/** Uniform JSON shape so the client never has to guess at an error body. */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Wraps a route handler: opens the DB connection, converts the known error
 * types to responses, and keeps unexpected errors off the wire.
 */
export function route<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
) {
  return async (...args: T): Promise<Response> => {
    try {
      await connectDb();
      return await handler(...args);
    } catch (err) {
      if (err instanceof AuthError) return fail(err.message, err.status);
      if (err instanceof ZodError) {
        return fail("Invalid request", 422, {
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      const message = err instanceof Error ? err.message : "Unexpected error";
      console.error("[api]", message, err);
      // Connection problems are worth surfacing verbatim — they are almost
      // always a missing or wrong MONGODB_URI, and a generic 500 hides that.
      if (/MONGODB_URI|ECONNREFUSED|ServerSelection|querySrv|Authentication failed/i.test(message)) {
        return fail(`Database unavailable: ${message}`, 503);
      }
      return fail("Something went wrong", 500);
    }
  };
}

/**
 * Verification gate (seed §6.4, §17).
 *
 * Registering as a clinician is not the same as being one. Until an
 * administrator verifies the account it can sign in and see its own status, and
 * nothing else — it cannot accept a consultation or issue a prescription.
 */
export async function requireVerifiedClinician() {
  const session = await requireRole("CLINICIAN");
  const user = await User.findById(session.userId).select("clinician").lean();
  if (!user?.clinician?.verified) {
    throw new AuthError(
      "Your clinician account is awaiting verification by an administrator.",
      403,
    );
  }
  return session;
}

export async function requireVerifiedPharmacy() {
  const session = await requireRole("PHARMACY");
  const user = await User.findById(session.userId).select("pharmacy").lean();
  if (!user?.pharmacy?.verified) {
    throw new AuthError(
      "Your pharmacy account is awaiting verification by an administrator.",
      403,
    );
  }
  return session;
}

/** Audit trail (seed §20). Never throws — a failed log must not fail the action. */
export async function audit(entry: {
  actorUserId?: string;
  actorRole: string;
  action: string;
  resource: string;
  resourceId?: string;
  prevState?: string;
  newState?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await AuditLog.create(entry);
  } catch (err) {
    console.error("[audit] failed to record", entry.action, err);
  }
}
