import { route, fail } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { Attachment, Consultation } from "@/lib/models";

/**
 * Serves the raw bytes of an upload.
 *
 * Two ways to be allowed: you uploaded it, or you are the clinician on the
 * consultation that this conversation produced. Nobody else, including other
 * clinicians and any pharmacy.
 */
export const GET = route(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    const { id } = await ctx.params;

    const attachment = await Attachment.findById(id).lean();
    if (!attachment) return fail("Not found", 404);

    let allowed = String(attachment.ownerUserId) === session.userId;

    if (!allowed && session.role === "CLINICIAN" && attachment.conversationId) {
      const consultation = await Consultation.findOne({
        conversationId: attachment.conversationId,
        clinicianUserId: session.userId,
      })
        .select("_id")
        .lean();
      allowed = Boolean(consultation);
    }

    if (!allowed) return fail("Not allowed", 403);

    return new Response(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.size),
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  },
);

export const dynamic = "force-dynamic";
