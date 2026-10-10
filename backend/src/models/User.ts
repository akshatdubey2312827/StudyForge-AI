import { Schema, model, Document, Types } from "mongoose";

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  googleId: string;
  name: string;
  avatarUrl?: string;
  refreshTokenHash?: string; // bcrypt-hashed refresh token for rotation
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true },
    avatarUrl: { type: String },
    refreshTokenHash: { type: String }, // stored hashed, never plaintext
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const User = model<IUser>("User", UserSchema);
