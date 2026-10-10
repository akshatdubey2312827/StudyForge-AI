import { Schema, model, Document, Types } from "mongoose";

export type TransactionStatus = "pending" | "completed" | "refunded" | "failed";

export interface ITransaction extends Document {
  _id: Types.ObjectId;
  stripePaymentIntentId: string; // unique — idempotency key for webhook
  userId: Types.ObjectId;
  /** Amount in smallest currency unit (paise for INR, cents for USD) */
  amount: number;
  currency: string;
  credits: number; // credits granted by this transaction
  status: TransactionStatus;
  package: string; // 'starter' | 'pro' | 'unlimited'
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    stripePaymentIntentId: {
      type: String,
      required: true,
      unique: true, // idempotency: prevents double-crediting
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "inr" },
    credits: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "refunded", "failed"],
      default: "pending",
    },
    package: { type: String, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const Transaction = model<ITransaction>("Transaction", TransactionSchema);
