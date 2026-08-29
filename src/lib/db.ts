import mongoose from "mongoose";
import dns from "node:dns";

/**
 * `mongodb+srv://` needs a DNS SRV lookup, and a fair number of resolvers —
 * mobile hotspots, some ISPs, some corporate networks — refuse SRV queries
 * outright. The failure surfaces as `querySrv ECONNREFUSED`, which reads like a
 * bad connection string rather than a DNS policy problem.
 *
 * Setting DNS_SERVERS points Node at a resolver that will answer, without
 * requiring changes to the machine's network settings.
 */
let dnsConfigured = false;

function applyDnsOverride() {
  // Called from connectDb rather than at module load: Next runs server code in
  // a worker process, and configuring the resolver on the way in guarantees it
  // happens in whichever process actually opens the connection.
  if (dnsConfigured || !process.env.DNS_SERVERS) return;
  dnsConfigured = true;

  const servers = process.env.DNS_SERVERS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!servers.length) return;

  try {
    // Both, deliberately. `dns.setServers` configures the callback API's global
    // resolver; `dns.promises` keeps a separate default instance, and that is
    // the one the MongoDB driver's SRV lookup actually goes through. Setting
    // only the first logs a reassuring "overridden" line and changes nothing.
    dns.setServers(servers);
    dns.promises.setServers(servers);
    console.log(`[db] DNS resolver overridden -> ${servers.join(", ")}`);
  } catch (err) {
    console.warn("[db] DNS_SERVERS was ignored — invalid value:", err);
  }
}

/**
 * Cached connection. Next dev reloads modules on every edit, and a fresh
 * connection per reload exhausts the Atlas connection pool within minutes.
 */
declare global {
  // eslint-disable-next-line no-var
  var __careloopMongoose:
    | { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
    | undefined;
}

const cached = global.__careloopMongoose ?? { conn: null, promise: null };
global.__careloopMongoose = cached;

export function mongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env and point it at a " +
        "local mongod or an Atlas cluster.",
    );
  }
  return uri;
}

export async function connectDb(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  applyDnsOverride();

  if (!cached.promise) {
    cached.promise = mongoose.connect(mongoUri(), {
      dbName: process.env.MONGODB_DB || "careloop",
      // Fail fast rather than hanging a request for 30s when the cluster is
      // unreachable — the UI can then show a real error.
      serverSelectionTimeoutMS: 8000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
