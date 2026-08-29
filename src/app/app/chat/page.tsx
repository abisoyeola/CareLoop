import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Conversation, Message, Assessment } from "@/lib/models";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

export const metadata = { title: "Health chats — CareLoop" };
export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await requireSession();
  if (session.role !== "PATIENT") redirect("/app");

  await connectDb();

  const conversations = await Conversation.find({ patientUserId: session.userId })
    .sort({ updatedAt: -1 })
    .lean();

  const ids = conversations.map((c) => c._id);
  const [assessments, lastMessages] = await Promise.all([
    Assessment.find({ conversationId: { $in: ids } })
      .select("conversationId finalPathway")
      .lean(),
    Message.aggregate([
      { $match: { conversationId: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$conversationId",
          content: { $first: "$content" },
        },
      },
    ]),
  ]);

  const pathwayBy = new Map(assessments.map((a) => [String(a.conversationId), a.finalPathway]));
  const lastBy = new Map(lastMessages.map((m) => [String(m._id), m.content as string]));

  return (
    <ChatWorkspace
      initial={conversations.map((c) => ({
        id: String(c._id),
        title: c.title,
        state: c.state,
        pathway: pathwayBy.get(String(c._id)) ?? null,
        lastMessage: (lastBy.get(String(c._id)) ?? "").slice(0, 90),
        updatedAt: c.updatedAt.toISOString(),
      }))}
    />
  );
}
