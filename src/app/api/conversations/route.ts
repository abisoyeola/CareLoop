import { Types } from "mongoose";
import { route, ok, audit } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { Conversation, Message, Assessment } from "@/lib/models";
import { OPENING_MESSAGE, serialiseMessage } from "@/lib/conversation-service";

/** The patient's chat list — the left rail of the WhatsApp-style UI. */
export const GET = route(async () => {
  const session = await requireRole("PATIENT");

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
      { $group: { _id: "$conversationId", content: { $first: "$content" }, createdAt: { $first: "$createdAt" } } },
    ]),
  ]);

  const pathwayBy = new Map(assessments.map((a) => [String(a.conversationId), a.finalPathway]));
  const lastBy = new Map(lastMessages.map((m) => [String(m._id), m]));

  return ok({
    conversations: conversations.map((c) => ({
      id: String(c._id),
      title: c.title,
      state: c.state,
      pathway: pathwayBy.get(String(c._id)) ?? null,
      lastMessage: lastBy.get(String(c._id))?.content?.slice(0, 90) ?? "",
      updatedAt: c.updatedAt,
    })),
  });
});

export const POST = route(async () => {
  const session = await requireRole("PATIENT");

  const conversation = await Conversation.create({
    patientUserId: new Types.ObjectId(session.userId),
    state: "ACTIVE",
  });

  // Fixed greeting rather than a model call — it is the same every time, it
  // carries the safety framing, and spending a request on it would be waste.
  const greeting = await Message.create({
    conversationId: conversation._id,
    senderRole: "AI",
    content: OPENING_MESSAGE,
    kind: "TEXT",
  });

  await audit({
    actorUserId: session.userId,
    actorRole: "PATIENT",
    action: "conversation.started",
    resource: "Conversation",
    resourceId: String(conversation._id),
  });

  return ok(
    {
      conversation: {
        id: String(conversation._id),
        title: conversation.title,
        state: conversation.state,
      },
      messages: [serialiseMessage(greeting.toObject())],
    },
    201,
  );
});

export const dynamic = "force-dynamic";
