import { QueryFilter, Types } from "mongoose";
import { route, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { Consultation, Assessment, User, Message, IConsultation } from "@/lib/models";

/**
 * Consultation list.
 *
 * Clinicians see the unclaimed queue plus their own caseload; patients see only
 * their own. Ordering is by pathway urgency first, then age — a RED that
 * arrived a minute ago outranks a YELLOW that has been waiting an hour.
 */
export const GET = route(async () => {
  const session = await requireSession();

  const filter: QueryFilter<IConsultation> =
    session.role === "CLINICIAN"
      ? { $or: [{ state: "QUEUED" }, { clinicianUserId: session.userId }] }
      : { patientUserId: session.userId };

  const consultations = await Consultation.find(filter)
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();

  const assessmentIds = consultations.map((c) => c.assessmentId);
  const patientIds = consultations.map((c) => c.patientUserId);
  const clinicianIds = consultations
    .map((c) => c.clinicianUserId)
    .filter((id): id is Types.ObjectId => Boolean(id));

  const [assessments, people, unreadCounts] = await Promise.all([
    Assessment.find({ _id: { $in: assessmentIds } })
      .select("finalPathway aiPathway chiefComplaint summary verification urgency")
      .lean(),
    User.find({ _id: { $in: [...patientIds, ...clinicianIds] } })
      .select("name role")
      .lean(),
    Message.aggregate([
      { $match: { consultationId: { $in: consultations.map((c) => c._id) } } },
      { $group: { _id: "$consultationId", count: { $sum: 1 }, last: { $max: "$createdAt" } } },
    ]),
  ]);

  const assessmentBy = new Map(assessments.map((a) => [String(a._id), a]));
  const personBy = new Map(people.map((p) => [String(p._id), p]));
  const messageBy = new Map(unreadCounts.map((m) => [String(m._id), m]));

  const rank: Record<string, number> = { RED: 0, YELLOW: 1, MEDICATION_REVIEW: 2, GREEN: 3 };

  const rows = consultations.map((c) => {
    const a = assessmentBy.get(String(c.assessmentId));
    return {
      id: String(c._id),
      state: c.state,
      pathway: a?.finalPathway ?? "YELLOW",
      aiPathway: a?.aiPathway ?? null,
      escalated: Boolean(a?.verification?.escalated),
      chiefComplaint: a?.chiefComplaint ?? "",
      summary: a?.summary ?? "",
      patientName: personBy.get(String(c.patientUserId))?.name ?? "Patient",
      clinicianName: c.clinicianUserId
        ? (personBy.get(String(c.clinicianUserId))?.name ?? null)
        : null,
      mine: c.clinicianUserId ? String(c.clinicianUserId) === session.userId : false,
      messageCount: messageBy.get(String(c._id))?.count ?? 0,
      lastMessageAt: messageBy.get(String(c._id))?.last ?? null,
      createdAt: c.createdAt,
      acceptedAt: c.acceptedAt ?? null,
    };
  });

  rows.sort(
    (x, y) =>
      (rank[x.pathway] ?? 9) - (rank[y.pathway] ?? 9) ||
      new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime(),
  );

  return ok({ consultations: rows });
});

export const dynamic = "force-dynamic";
