import mongoose, { Schema, Model, Types } from "mongoose";

/**
 * All CareLoop collections in one module.
 *
 * Role-specific profile data is embedded on User rather than split into
 * separate collections: every read of a clinician or pharmacy needs the
 * identity anyway, so a subdocument avoids a join on the hot paths.
 */

export type Role = "PATIENT" | "CLINICIAN" | "PHARMACY" | "ADMIN";
export type Pathway = "GREEN" | "YELLOW" | "MEDICATION_REVIEW" | "RED";
export type ConversationState =
  | "ACTIVE"
  | "ASSESSING"
  | "ASSESSMENT_COMPLETE"
  | "ROUTED";
export type ConsultationState =
  | "QUEUED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED";
export type OrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "COMPLETED";

export const PATHWAYS: Pathway[] = [
  "GREEN",
  "YELLOW",
  "MEDICATION_REVIEW",
  "RED",
];

/** Ordered by escalation level. Verification may move a case up, never down. */
export const PATHWAY_RANK: Record<Pathway, number> = {
  GREEN: 0,
  MEDICATION_REVIEW: 1,
  YELLOW: 2,
  RED: 3,
};

// ------------------------------------------------------------------ User

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  patient?: {
    dateOfBirth?: string;
    sex?: string;
    knownAllergies?: string;
    currentMeds?: string;
  };
  clinician?: {
    specialty: string;
    licenseNo: string;
    verified: boolean;
  };
  pharmacy?: {
    name: string;
    address: string;
    phone: string;
    verified: boolean;
    deliveryAvailable: boolean;
    openingHours: string;
  };
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      required: true,
      enum: ["PATIENT", "CLINICIAN", "PHARMACY", "ADMIN"],
    },
    patient: {
      dateOfBirth: String,
      sex: String,
      // Patient-reported. Never treated as a verified clinical record.
      knownAllergies: String,
      currentMeds: String,
    },
    clinician: {
      specialty: { type: String, default: "General Practice" },
      licenseNo: String,
      verified: { type: Boolean, default: false },
    },
    pharmacy: {
      name: String,
      address: String,
      phone: String,
      verified: { type: Boolean, default: false },
      deliveryAvailable: { type: Boolean, default: true },
      openingHours: { type: String, default: "08:00 - 20:00" },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// ---------------------------------------------------------- Conversation

export interface IConversation {
  _id: Types.ObjectId;
  patientUserId: Types.ObjectId;
  state: ConversationState;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    patientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    state: {
      type: String,
      default: "ACTIVE",
      enum: ["ACTIVE", "ASSESSING", "ASSESSMENT_COMPLETE", "ROUTED"],
    },
    title: { type: String, default: "New health chat" },
  },
  { timestamps: true },
);

// -------------------------------------------------------------- Message

export interface IMessage {
  _id: Types.ObjectId;
  conversationId?: Types.ObjectId;
  consultationId?: Types.ObjectId;
  senderRole: "PATIENT" | "AI" | "CLINICIAN" | "PHARMACY" | "SYSTEM";
  senderUserId?: Types.ObjectId;
  content: string;
  kind: "TEXT" | "ATTACHMENT" | "ASSESSMENT_CARD" | "SYSTEM_EVENT" | "OPTIONS";
  meta?: Record<string, unknown>;
  attachmentIds: Types.ObjectId[];
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", index: true },
    consultationId: { type: Schema.Types.ObjectId, ref: "Consultation", index: true },
    senderRole: {
      type: String,
      required: true,
      enum: ["PATIENT", "AI", "CLINICIAN", "PHARMACY", "SYSTEM"],
    },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User" },
    content: { type: String, default: "" },
    kind: {
      type: String,
      default: "TEXT",
      enum: ["TEXT", "ATTACHMENT", "ASSESSMENT_CARD", "SYSTEM_EVENT", "OPTIONS"],
    },
    meta: { type: Schema.Types.Mixed },
    attachmentIds: [{ type: Schema.Types.ObjectId, ref: "Attachment" }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ consultationId: 1, createdAt: 1 });

// ----------------------------------------------------------- Attachment

export interface IAttachment {
  _id: Types.ObjectId;
  ownerUserId: Types.ObjectId;
  conversationId?: Types.ObjectId;
  kind: "PHOTO" | "LAB_RESULT";
  filename: string;
  mimeType: string;
  size: number;
  data: Buffer;
  /** What the vision model read. Always displayed next to the original file. */
  extraction?: {
    kind: string;
    findings: string[];
    values?: { label: string; value: string; flag?: string }[];
    redFlags: string[];
    legible: boolean;
    caveat?: string;
  };
  createdAt: Date;
}

/**
 * Files live in their own collection so that loading a chat thread never drags
 * megabytes of image data along with it.
 */
const AttachmentSchema = new Schema<IAttachment>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", index: true },
    kind: { type: String, required: true, enum: ["PHOTO", "LAB_RESULT"] },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    extraction: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// ----------------------------------------------------------- Assessment

export interface IVerification {
  valid: boolean;
  schemaRepaired: boolean;
  escalated: boolean;
  escalatedFrom?: Pathway;
  escalationReason?: string;
  rulesFired: { id: string; label: string; pathway: Pathway; evidence: string }[];
  missingFields: string[];
}

export interface IAssessment {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  patientUserId: Types.ObjectId;
  chiefComplaint: string;
  duration?: string;
  severity?: string;
  symptoms: string[];
  redFlags: string[];
  allergies: string[];
  medications: string[];
  history: string[];
  summary: string;
  /** What the triage agent returned, before deterministic checks. */
  aiPathway: Pathway;
  /** What the system acted on, after the verification layer. */
  finalPathway: Pathway;
  urgency: string;
  verification: IVerification;
  requiresHumanReview: boolean;
  lockedAt: Date;
  telemetry?: {
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
    latencyMs?: number;
    costUsd?: number;
  };
}

const AssessmentSchema = new Schema<IAssessment>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      unique: true,
    },
    patientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    chiefComplaint: { type: String, required: true },
    duration: String,
    severity: String,
    symptoms: { type: [String], default: [] },
    redFlags: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
    medications: { type: [String], default: [] },
    history: { type: [String], default: [] },
    summary: { type: String, default: "" },
    aiPathway: { type: String, required: true, enum: PATHWAYS },
    finalPathway: { type: String, required: true, enum: PATHWAYS },
    urgency: { type: String, default: "non_urgent" },
    verification: { type: Schema.Types.Mixed, default: {} },
    requiresHumanReview: { type: Boolean, default: true },
    lockedAt: { type: Date, default: Date.now },
    telemetry: { type: Schema.Types.Mixed },
  },
  { timestamps: false },
);

// --------------------------------------------------------- Consultation

export interface IConsultation {
  _id: Types.ObjectId;
  assessmentId: Types.ObjectId;
  conversationId: Types.ObjectId;
  patientUserId: Types.ObjectId;
  clinicianUserId?: Types.ObjectId;
  state: ConsultationState;
  /** The clinician's own call. May confirm or overrule the AI pathway. */
  clinicianPathway?: Pathway;
  clinicianNotes?: string;
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
}

const ConsultationSchema = new Schema<IConsultation>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    patientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    clinicianUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    state: {
      type: String,
      default: "QUEUED",
      enum: ["QUEUED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"],
    },
    clinicianPathway: { type: String, enum: PATHWAYS },
    clinicianNotes: String,
    acceptedAt: Date,
    completedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// --------------------------------------------------------- Prescription

export interface IPrescriptionItem {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
  notes?: string;
}

export interface IPrescription {
  _id: Types.ObjectId;
  consultationId: Types.ObjectId;
  clinicianUserId: Types.ObjectId;
  patientUserId: Types.ObjectId;
  items: IPrescriptionItem[];
  notes?: string;
  issuedAt: Date;
}

const PrescriptionSchema = new Schema<IPrescription>(
  {
    consultationId: {
      type: Schema.Types.ObjectId,
      ref: "Consultation",
      required: true,
      unique: true,
    },
    clinicianUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    patientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: [
      {
        name: { type: String, required: true },
        dose: String,
        frequency: String,
        duration: String,
        notes: String,
      },
    ],
    notes: String,
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// -------------------------------------------------------- PharmacyOrder

export interface IPharmacyOrder {
  _id: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  patientUserId: Types.ObjectId;
  pharmacyUserId: Types.ObjectId;
  status: OrderStatus;
  fulfillmentMethod: "DELIVERY" | "PICKUP";
  rejectReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PharmacyOrderSchema = new Schema<IPharmacyOrder>(
  {
    prescriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Prescription",
      required: true,
      unique: true,
    },
    patientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pharmacyUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      default: "PENDING",
      enum: [
        "PENDING",
        "ACCEPTED",
        "REJECTED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "COMPLETED",
      ],
    },
    fulfillmentMethod: { type: String, default: "PICKUP", enum: ["DELIVERY", "PICKUP"] },
    rejectReason: String,
  },
  { timestamps: true },
);

// --------------------------------------------------------- Notification

export interface INotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    href: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// ------------------------------------------------------------- AuditLog

export interface IAuditLog {
  _id: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  actorRole: string;
  action: string;
  resource: string;
  resourceId?: string;
  prevState?: string;
  newState?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: "User" },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: String,
    prevState: String,
    newState: String,
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AuditLogSchema.index({ createdAt: -1 });

// -------------------------------------------------------------- exports

/**
 * `mongoose.models.X ?? model(...)` — Next's dev server re-evaluates this
 * module on every hot reload, and re-registering a schema throws OverwriteModelError.
 */
function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);
}

export const User = model<IUser>("User", UserSchema);
export const Conversation = model<IConversation>("Conversation", ConversationSchema);
export const Message = model<IMessage>("Message", MessageSchema);
export const Attachment = model<IAttachment>("Attachment", AttachmentSchema);
export const Assessment = model<IAssessment>("Assessment", AssessmentSchema);
export const Consultation = model<IConsultation>("Consultation", ConsultationSchema);
export const Prescription = model<IPrescription>("Prescription", PrescriptionSchema);
export const PharmacyOrder = model<IPharmacyOrder>("PharmacyOrder", PharmacyOrderSchema);
export const Notification = model<INotification>("Notification", NotificationSchema);
export const AuditLog = model<IAuditLog>("AuditLog", AuditLogSchema);
