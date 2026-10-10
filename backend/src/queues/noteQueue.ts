import { Queue } from "bullmq";
import { createRedisClient } from "../config/redis";
import type { IJobPayload } from "../models/Job";

const NOTE_QUEUE_NAME = "note-generation";

// Create a dedicated Redis connection for the queue
const queueConnection = createRedisClient();

export const noteQueue = new Queue<IJobPayload>(NOTE_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

export { NOTE_QUEUE_NAME };
