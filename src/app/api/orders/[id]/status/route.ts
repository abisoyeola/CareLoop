import { z } from "zod";
import { route, ok, fail, audit, requireVerifiedPharmacy } from "@/lib/api";
import { PharmacyOrder, Prescription, Message, OrderStatus } from "@/lib/models";
import { emitToUser } from "@/lib/realtime";

const schema = z.object({
  status: z.enum([
    "ACCEPTED",
    "REJECTED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "COMPLETED",
  ]),
  reason: z.string().max(500).optional(),
});

/**
 * Fulfilment state machine (seed §18). Transitions are whitelisted rather than
 * free-form so an order cannot jump from PENDING straight to COMPLETED and
 * skip the pharmacy actually confirming it holds the medication.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["PREPARING", "REJECTED"],
  PREPARING: ["READY", "OUT_FOR_DELIVERY"],
  READY: ["COMPLETED"],
  OUT_FOR_DELIVERY: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
};

const PATIENT_COPY: Record<string, string> = {
  ACCEPTED: "Your pharmacy has accepted the prescription and confirmed availability.",
  REJECTED: "Your pharmacy could not fulfil this prescription.",
  PREPARING: "Your pharmacy is preparing your medication.",
  READY: "Your medication is ready for collection.",
  OUT_FOR_DELIVERY: "Your medication is out for delivery.",
  COMPLETED: "Your prescription has been fulfilled.",
};

export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireVerifiedPharmacy();
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const order = await PharmacyOrder.findById(id);
    if (!order) return fail("Order not found", 404);
    if (String(order.pharmacyUserId) !== session.userId) {
      return fail("Not your order", 403);
    }

    const allowed = TRANSITIONS[order.status];
    if (!allowed.includes(body.status as OrderStatus)) {
      return fail(
        `Cannot move an order from ${order.status} to ${body.status}.` +
          (allowed.length ? ` Allowed next: ${allowed.join(", ")}.` : " This order is final."),
        409,
      );
    }
    if (body.status === "REJECTED" && !body.reason) {
      return fail("Give a reason so the patient and clinician know what happened", 422);
    }
    if (body.status === "OUT_FOR_DELIVERY" && order.fulfillmentMethod !== "DELIVERY") {
      return fail("This order was placed for pickup, not delivery", 409);
    }

    const prevState = order.status;
    order.status = body.status as OrderStatus;
    if (body.reason) order.rejectReason = body.reason;
    await order.save();

    const prescription = await Prescription.findById(order.prescriptionId)
      .select("consultationId")
      .lean();

    if (prescription) {
      await Message.create({
        consultationId: prescription.consultationId,
        senderRole: "PHARMACY",
        kind: "SYSTEM_EVENT",
        content:
          PATIENT_COPY[body.status] + (body.reason ? `\n\nReason: ${body.reason}` : ""),
        meta: { event: "order.status", orderId: id, status: body.status },
      });
    }

    await audit({
      actorUserId: session.userId,
      actorRole: "PHARMACY",
      action: "order.status-changed",
      resource: "PharmacyOrder",
      resourceId: id,
      prevState,
      newState: body.status,
      meta: body.reason ? { reason: body.reason } : undefined,
    });

    emitToUser(String(order.patientUserId), "order-update", {
      orderId: id,
      status: body.status,
      reason: body.reason ?? null,
    });
    emitToUser(session.userId, "order-update", { orderId: id, status: body.status });

    return ok({ order: { id, status: order.status } });
  },
);

export const dynamic = "force-dynamic";
