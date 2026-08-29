import type { Server } from "socket.io";
import { Role } from "./models";

/**
 * Server-side emit helpers.
 *
 * `server.mjs` parks the Socket.IO hub on a global; route handlers run in that
 * same process, so they can reach it. When the hub is absent (a script, or the
 * eval harness) every emit is a no-op rather than a crash.
 */

function hub(): Server | null {
  return (globalThis as { __careloopIo?: Server }).__careloopIo ?? null;
}

export type RealtimeEvent =
  | "message"
  | "assessment"
  | "conversation-state"
  | "consultation-update"
  | "queue-update"
  | "order-update"
  | "notification"
  | "agent-step";

export function emitToUser(userId: string, event: RealtimeEvent, payload: unknown) {
  hub()?.to(`user:${userId}`).emit(event, payload);
}

export function emitToUsers(userIds: (string | undefined | null)[], event: RealtimeEvent, payload: unknown) {
  const io = hub();
  if (!io) return;
  for (const id of userIds) {
    if (id) io.to(`user:${id}`).emit(event, payload);
  }
}

export function emitToRole(role: Role, event: RealtimeEvent, payload: unknown) {
  hub()?.to(`role:${role}`).emit(event, payload);
}

export function realtimeAvailable(): boolean {
  return hub() !== null;
}
