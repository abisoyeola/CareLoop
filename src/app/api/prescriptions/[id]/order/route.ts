import { z } from "zod";
import { Types } from "mongoose";
import { route, ok, fail, audit } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { Prescription, PharmacyOrder, User, Message } from "@/lib/models";
import { emitToUser } from "@/lib/realtime";

const schema = z.object({
  pharmacyUserId: z.string().regex(/^[a-f0-9]{24}$/i, "Choose a pharmacy"),
  fulfillmentMethod: z.enum(["DELIVERY", "PICKUP"]),
});

/** The patient picks where their prescription goes (seed §12, §13). */
export const POST = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole("PATIENT");
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const prescription = await Prescription.findById(id);
    if (!prescription) return fail("Prescription not found", 404);
    if (String(prescription.patientUserId) !== session.userId) {
      return fail("Not your prescription", 403);
    }
    if (await PharmacyOrder.findOne({ prescriptionId: prescription._id })) {
      return fail("This prescription has already been sent to a pharmacy", 409);
    }

    const pharmacy = await User.findOne({
      _id: body.pharmacyUserId,
      role: "PHARMACY",
      "pharmacy.verified": true,
    })
      .select("name pharmacy")
      .lean();

    if (!pharmacy) return fail("That pharmacy is not available", 404);
    if (body.fulfillmentMethod === "DELIVERY" && !pharmacy.pharmacy?.deliveryAvailable) {
      return fail("That pharmacy does not offer delivery", 422);
    }

    const order = await PharmacyOrder.create({
      prescriptionId: prescription._id,
      patientUserId: new Types.ObjectId(session.userId),
      pharmacyUserId: new Types.ObjectId(body.pharmacyUserId),
      fulfillmentMethod: body.fulfillmentMethod,
      status: "PENDING",
    });

    await Message.create({
      consultationId: prescription.consultationId,
      senderRole: "SYSTEM",
      kind: "SYSTEM_EVENT",
      content: `Prescription sent to ${pharmacy.pharmacy?.name ?? pharmacy.name} for ${
        body.fulfillmentMethod === "DELIVERY" ? "delivery" : "pickup"
      }.`,
      meta: { event: "order.created", orderId: String(order._id) },
    });

    await audit({
      actorUserId: session.userId,
      actorRole: "PATIENT",
      action: "order.created",
      resource: "PharmacyOrder",
      resourceId: String(order._id),
      newState: "PENDING",
      meta: { pharmacy: pharmacy.pharmacy?.name, method: body.fulfillmentMethod },
    });

    emitToUser(body.pharmacyUserId, "order-update", {
      orderId: String(order._id),
      status: "PENDING",
      itemCount: prescription.items.length,
    });

    return ok(
      {
        order: {
          id: String(order._id),
          status: order.status,
          pharmacyName: pharmacy.pharmacy?.name ?? pharmacy.name,
          method: order.fulfillmentMethod,
        },
      },
      201,
    );
  },
);

export const dynamic = "force-dynamic";
