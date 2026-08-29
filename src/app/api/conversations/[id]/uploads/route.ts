import { Types } from "mongoose";
import { route, ok, fail, audit } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { Conversation, Message, Attachment } from "@/lib/models";
import { emitToUser } from "@/lib/realtime";
import { advanceConversation, serialiseMessage } from "@/lib/conversation-service";
import { readUpload } from "@/agents/steps";
import { Trajectory } from "@/agents/call";

const MAX_BYTES = 5 * 1024 * 1024;
const READABLE = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const ACCEPTED = new Set([...READABLE, "application/pdf"]);

/**
 * Patient uploads a photo of the affected area or a test result.
 *
 * Images are read by the vision step and the findings feed the assessment.
 * PDFs are stored and surfaced to the clinician but explicitly not machine-read
 * — claiming to have read a document we cannot parse would be worse than
 * admitting we did not.
 */
export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole("PATIENT");
    const { id } = await ctx.params;

    const conversation = await Conversation.findById(id);
    if (!conversation) return fail("Conversation not found", 404);
    if (String(conversation.patientUserId) !== session.userId) {
      return fail("Not your conversation", 403);
    }

    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "PHOTO");
    const caption = String(form.get("caption") || "").slice(0, 500);

    if (!(file instanceof File)) return fail("No file was uploaded", 422);
    if (file.size > MAX_BYTES) return fail("Files must be 5 MB or smaller", 413);
    if (!ACCEPTED.has(file.type)) {
      return fail(`Unsupported file type: ${file.type || "unknown"}. Use PNG, JPEG, WebP or PDF.`, 415);
    }
    if (kind !== "PHOTO" && kind !== "LAB_RESULT") return fail("Invalid upload kind", 422);

    const bytes = Buffer.from(await file.arrayBuffer());

    const trajectory = new Trajectory((step) =>
      emitToUser(session.userId, "agent-step", {
        conversationId: id,
        step: step.step,
        note: step.note,
        model: step.model,
        latencyMs: step.latencyMs,
      }),
    );

    const extraction = READABLE.has(file.type)
      ? await readUpload(
          {
            mimeType: file.type,
            base64: bytes.toString("base64"),
            filename: file.name,
            kind,
          },
          trajectory,
        )
      : {
          kind: "pdf",
          findings: [],
          values: [],
          redFlags: [],
          legible: false,
          caveat:
            "PDF uploads are not machine-read. The reviewing clinician will open this file directly.",
        };

    const attachment = await Attachment.create({
      ownerUserId: new Types.ObjectId(session.userId),
      conversationId: new Types.ObjectId(id),
      kind,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      data: bytes,
      extraction,
    });

    const label =
      kind === "LAB_RESULT" ? "Uploaded a test result" : "Uploaded a photo";

    const patientMessage = await Message.create({
      conversationId: new Types.ObjectId(id),
      senderRole: "PATIENT",
      senderUserId: new Types.ObjectId(session.userId),
      content: caption ? `${label}: ${caption}` : label,
      kind: "ATTACHMENT",
      meta: {
        filename: file.name,
        mimeType: file.type,
        uploadKind: kind,
        legible: extraction.legible,
        findings: extraction.findings,
        values: extraction.values,
        redFlags: extraction.redFlags,
        caveat: extraction.caveat ?? null,
      },
      attachmentIds: [attachment._id],
    });

    await audit({
      actorUserId: session.userId,
      actorRole: "PATIENT",
      action: "upload.received",
      resource: "Attachment",
      resourceId: String(attachment._id),
      meta: { kind, legible: extraction.legible, redFlags: extraction.redFlags },
    });

    const sent = serialiseMessage(patientMessage.toObject());
    emitToUser(session.userId, "message", { conversationId: id, message: sent });

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

    return ok({
      attachment: {
        id: String(attachment._id),
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        kind: attachment.kind,
        extraction,
      },
      message: sent,
      replies,
    });
  },
);

export const dynamic = "force-dynamic";
