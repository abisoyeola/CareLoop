import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDb } from "../src/lib/db";
import { User } from "../src/lib/models";

/**
 * Demo accounts.
 *
 * Idempotent: re-running updates the existing rows rather than duplicating them,
 * so it is safe to call on every deploy. Only the four demo logins are created —
 * no patient data, no conversations. Everything clinical in this project is
 * generated at runtime or lives in eval/cases.json as synthetic cases.
 */

const PASSWORD = process.env.SEED_PASSWORD || "CareLoop!2026";

const ACCOUNTS = [
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
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const account of ACCOUNTS) {
    const existing = await User.findOne({ email: account.email });
    if (existing) {
      Object.assign(existing, account, { passwordHash });
      await existing.save();
      console.log(`  updated  ${account.email.padEnd(28)} ${account.role}`);
    } else {
      await User.create({ ...account, passwordHash });
      console.log(`  created  ${account.email.padEnd(28)} ${account.role}`);
    }
  }

  console.log(`\nAll demo accounts use the password: ${PASSWORD}`);
  console.log("Change SEED_PASSWORD in .env before any non-demo use.\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
