import { Schema, model, Document, Types } from "mongoose";

export type Difficulty = "easy" | "medium" | "hard";
export type NoteStatus = "pending" | "processing" | "complete" | "failed";
export type DiagramType = "mermaid" | "recharts_bar" | "recharts_pie" | "recharts_line";
export type PriorityLevel = "high" | "medium" | "low";

export interface IDiagram {
  id: string;
  type: DiagramType;
  title: string;
  /** Mermaid: raw string. Recharts: structured RechartsData object */
  data: any;
}

export interface IQuestion {
  id: string;
  question: string;
  answer: string;
  priority: PriorityLevel;
  tags: string[];
}

export interface INote extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  topic: string;
  difficulty: Difficulty;
  /** Markdown content */
  content: string;
  diagrams: IDiagram[];
  questions: IQuestion[];
  status: NoteStatus;
  jobId?: string; // BullMQ job ID
  createdAt: Date;
  updatedAt: Date;
}

const DiagramSchema = new Schema<IDiagram>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["mermaid", "recharts_bar", "recharts_pie", "recharts_line"],
      required: true,
    },
    title: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const QuestionSchema = new Schema<IQuestion>(
  {
    id: { type: String, required: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      required: true,
    },
    tags: [{ type: String }],
  },
  { _id: false },
);

const NoteSchema = new Schema<INote>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    topic: { type: String, required: true, maxlength: 300 },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
    content: { type: String, default: "" },
    diagrams: [DiagramSchema],
    questions: [QuestionSchema],
    status: {
      type: String,
      enum: ["pending", "processing", "complete", "failed"],
      default: "pending",
    },
    jobId: { type: String, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

NoteSchema.index({ userId: 1, createdAt: -1 });

export const Note = model<INote>("Note", NoteSchema);
