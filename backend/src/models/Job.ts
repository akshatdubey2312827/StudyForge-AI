import { Schema, model, Document, Types } from "mongoose";

export type JobStatus = "pending" | "processing" | "complete" | "failed";
export type JobType = "generate-note";

export interface IJobPayload {
  userId: string;
  noteId: string;
  topic: string;
  difficulty: string;
  ledgerReserveId: string; // _id of the CreditLedger reserve entry
}

export interface IJob extends Document {
  _id: Types.ObjectId;
  bullmqJobId?: string; // BullMQ-assigned ID, set after enqueue
  type: JobType;
  status: JobStatus;
  payload: IJobPayload;
  result?: Record<string, unknown>;
  error?: string;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    bullmqJobId: { type: String, index: true, sparse: true },
    type: {
      type: String,
      enum: ["generate-note"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "complete", "failed"],
      default: "pending",
    },
    payload: {
      userId: { type: String, required: true },
      noteId: { type: String, required: true },
      topic: { type: String, required: true },
      difficulty: { type: String, required: true },
      ledgerReserveId: { type: String },
    },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    attempts: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const Job = model<IJob>("Job", JobSchema);
