import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDb } from "../src/lib/db";
import { User } from "../src/lib/models";

/**
 * Demo accounts.
 *
 * Idempotent: re-running updates the existing rows rather than duplicating them,
 * so it is safe to call on every deploy. Only the demo logins are created —
 * no patient data, no conversations. Everything clinical in this project is
 * generated at runtime or lives in eval/cases.json as synthetic cases.
 *
 * Default admin: micro1@careloop.com / beyourself
 */

const PASSWORD = process.env.SEED_PASSWORD || "CareLoop!2026";

const ACCOUNTS = [
  // ── Primary admin (always seeded) ─────────────────────────────────────────
  {
    email: "micro1@careloop.com",
    name: "Micro1 Admin",
    role: "ADMIN" as const,
    _password: "beyourself",
  },
  // ── Legacy demo admin ──────────────────────────────────────────────────────
  {
    email: "admin@careloop.test",
    name: "Platform Admin",
    role: "ADMIN" as const,
  },
  {
    email: "patient@careloop.test",
    name: "Ada Nwosu",
    role: "PATIENT" as const,
    patient: {
      dateOfBirth: "1991-04-12",
      sex: "female",
      knownAllergies: "Penicillin (rash)",
      currentMeds: "None",
    },
  },
  {
    email: "clinician@careloop.test",
    name: "Dr Ibrahim Bello",
    role: "CLINICIAN" as const,
    clinician: { specialty: "General Practice", licenseNo: "MDCN/48210", verified: true },
  },
  {
    email: "pharmacy@careloop.test",
    name: "Grace Pharmacy",
    role: "PHARMACY" as const,
    pharmacy: {
      name: "Grace Pharmacy",
      address: "14 Awolowo Road, Ikoyi, Lagos",
      phone: "+234 801 234 5678",
      verified: true,
      deliveryAvailable: true,
      openingHours: "08:00 - 22:00",
    },
  },
  {
    email: "pharmacy2@careloop.test",
    name: "Unity Chemists",
    role: "PHARMACY" as const,
    pharmacy: {
      name: "Unity Chemists",
      address: "3 Herbert Macaulay Way, Yaba, Lagos",
      phone: "+234 802 987 6543",
      verified: true,
      deliveryAvailable: false,
      openingHours: "09:00 - 18:00",
    },
  },
];

async function main() {
  await connectDb();
  const defaultHash = await bcrypt.hash(PASSWORD, 10);

  for (const account of ACCOUNTS) {
    // Use per-account password if supplied, otherwise fall back to DEFAULT
    const { _password, ...data } = account as typeof account & { _password?: string };
    const passwordHash = _password ? await bcrypt.hash(_password, 10) : defaultHash;

    const existing = await User.findOne({ email: account.email });
    if (existing) {
      Object.assign(existing, data, { passwordHash });
      await existing.save();
      console.log(`  updated  ${account.email.padEnd(32)} ${account.role}`);
    } else {
      await User.create({ ...data, passwordHash });
      console.log(`  created  ${account.email.padEnd(32)} ${account.role}`);
    }
  }

  console.log("\n┌────────────────────────────────────────────────────────────┐");
  console.log("│  DEFAULT ADMIN CREDENTIALS                                 │");
  console.log("│  Email:    micro1@careloop.com                             │");
  console.log("│  Password: beyourself                                      │");
  console.log("│  Login at: /admin-login                                    │");
  console.log("├────────────────────────────────────────────────────────────┤");
  console.log(`│  Other demo accounts use password: ${PASSWORD.padEnd(24)} │`);
  console.log("└────────────────────────────────────────────────────────────┘\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
