import { Schema, model, Document, Types } from "mongoose";

export type LedgerReason = "purchase" | "spend" | "refund" | "reserve";

export interface ICreditLedger extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** Positive = credits added (purchase/refund), Negative = credits deducted (spend/reserve) */
  delta: number;
  reason: LedgerReason;
  /** Reference to the related entity — stripe paymentIntentId, noteId, jobId, etc. */
  relatedId?: string;
  createdAt: Date;
}

const CreditLedgerSchema = new Schema<ICreditLedger>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    delta: { type: Number, required: true },
    reason: {
      type: String,
      enum: ["purchase", "spend", "refund", "reserve"],
      required: true,
    },
    relatedId: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // ledger entries are immutable
    versionKey: false,
  },
);

// Compound index for efficient balance queries per user
CreditLedgerSchema.index({ userId: 1, createdAt: -1 });

export const CreditLedger = model<ICreditLedger>("CreditLedger", CreditLedgerSchema);
