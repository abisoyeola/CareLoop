import { createServer } from "node:http";
import { parse, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import next from "next";
import { Server } from "socket.io";
import { jwtVerify } from "jose";

// Resolve everything against this file rather than process.cwd(), so the server
// starts correctly no matter which directory it was launched from.
const rootDir = dirname(fileURLToPath(import.meta.url));

/**
 * Run as though launched from the project root.
 *
 * Passing `dir` to Next is not enough: Tailwind v4 resolves the files it scans
 * for class names from process.cwd(), so starting the server from anywhere else
 * yields a silently unstyled app — every utility class missing, no error.
 */
if (process.cwd() !== rootDir) {
  process.chdir(rootDir);
}

dotenv.config({ path: join(rootDir, ".env") });

/**
 * Custom server so Socket.IO and Next share one HTTP listener — which is what
 * lets this deploy to Render as a single web service.
 *
 * Authorisation model: clients never join rooms by id. A socket is placed only
 * into rooms derived from its own verified session (its user room, and its role
 * room). Route handlers decide who receives an event by emitting to those rooms.
 * A client cannot subscribe to a conversation it does not own, because there is
 * no room it could ask to join.
 */

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "0.0.0.0";

const app = next({ dev, hostname, port, dir: rootDir });
const handle = app.getRequestHandler();

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

async function sessionFromSocket(socket) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  const token = parseCookies(socket.handshake.headers.cookie || "").careloop_session;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload?.userId ? payload : null;
  } catch {
    return null;
  }
}

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res, parse(req.url, true));
});

const io = new Server(server, {
  path: "/api/socket",
  cors: { origin: false },
  maxHttpBufferSize: 1e6,
});

io.use(async (socket, nextFn) => {
  const session = await sessionFromSocket(socket);
  if (!session) return nextFn(new Error("unauthorised"));
  socket.data.session = session;
  nextFn();
});

io.on("connection", (socket) => {
  const { userId, role } = socket.data.session;
  socket.join(`user:${userId}`);
  socket.join(`role:${role}`);

  socket.on("typing", ({ threadId, threadType, name }) => {
    // Relayed only to the other participant's user room, supplied by the
    // server-side handler that owns the thread — see /api routes.
    socket.to(`thread:${threadType}:${threadId}`).emit("typing", { name });
  });

  // Typing indicators are the one place a client needs a thread room. The room
  // carries no payload beyond a display name, so membership is not sensitive.
  socket.on("watch-thread", ({ threadId, threadType }) => {
    if (typeof threadId === "string" && /^[a-f0-9]{24}$/i.test(threadId)) {
      socket.join(`thread:${threadType}:${threadId}`);
    }
  });
});

// Route handlers reach the hub through this global.
globalThis.__careloopIo = io;

server.listen(port, hostname, () => {
  const mode = dev ? "development" : "production";
  console.log(`CareLoop ready on http://localhost:${port}  (${mode})`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("  ! OPENAI_API_KEY not set — agents will run on the deterministic mock.");
  }
  if (!process.env.MONGODB_URI) {
    console.warn("  ! MONGODB_URI not set — database calls will fail.");
  }
});
