import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { SocketProvider } from "@/components/SocketProvider";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");

  let verified = true;
  if (session.role === "CLINICIAN" || session.role === "PHARMACY") {
    await connectDb();
    const user = await User.findById(session.userId).select("clinician pharmacy").lean();
    verified =
      session.role === "CLINICIAN"
        ? Boolean(user?.clinician?.verified)
        : Boolean(user?.pharmacy?.verified);
  }

  return (
    <SocketProvider>
      <div className="flex h-screen flex-col lg:flex-row">
        <AppNav role={session.role} name={session.name} verified={verified} />
        <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </SocketProvider>
  );
}
