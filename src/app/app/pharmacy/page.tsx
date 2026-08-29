import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { PharmacyBoard } from "@/components/pharmacy/PharmacyBoard";

export const metadata = { title: "Fulfilment — CareLoop" };
export const dynamic = "force-dynamic";

export default async function PharmacyPage() {
  const session = await requireSession();
  if (session.role !== "PHARMACY") redirect("/app");

  await connectDb();
  const user = await User.findById(session.userId).select("pharmacy").lean();

  return <PharmacyBoard verified={Boolean(user?.pharmacy?.verified)} />;
}
