import { z } from "zod";
import { Types } from "mongoose";
import { route, ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { Conversation, Message } from "@/lib/models";
import { emitToUser } from "@/lib/realtime";
import { advanceConversation, serialiseMessage } from "@/lib/conversation-service";

const schema = z.object({ content: z.string().min(1).max(4000) });

export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole("PATIENT");
    const { id } = await ctx.params;
    const { content } = schema.parse(await req.json());

    const conversation = await Conversation.findById(id);
    if (!conversation) return fail("Conversation not found", 404);
    if (String(conversation.patientUserId) !== session.userId) {
      return fail("Not your conversation", 403);
    }
    if (conversation.state === "ROUTED") {
      return fail(
        "This conversation has already been routed to a clinician. Continue in the consultation thread.",
        409,
      );
    }

    const patientMessage = await Message.create({
      conversationId: new Types.ObjectId(id),
      senderRole: "PATIENT",
      senderUserId: new Types.ObjectId(session.userId),
      content,
      kind: "TEXT",
    });

    const sent = serialiseMessage(patientMessage.toObject());
    emitToUser(session.userId, "message", { conversationId: id, message: sent });

    // The agent turn runs inline: the patient is waiting on it, and a queue
    // here would buy nothing but a spinner that lies about being finished.
    const { created, assessment } = await advanceConversation({
      conversationId: id,
      patientUserId: session.userId,
    });

    const replies = created.map(serialiseMessage);
    for (const message of replies) {
      emitToUser(session.userId, "message", { conversationId: id, message });
    }

    if (assessment) {
      emitToUser(session.userId, "conversation-state", {
        conversationId: id,
        state: "ASSESSMENT_COMPLETE",
        pathway: assessment.finalPathway,
      });
    }

    return ok({ message: sent, replies, assessmentId: assessment ? String(assessment._id) : null });
  },
);

export const dynamic = "force-dynamic";
