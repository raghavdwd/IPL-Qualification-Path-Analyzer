/*
  MongoDB connection manager and session persistence layer using Mongoose.
  Replaces the old in-memory Map with a proper ODM so
  conversations survive bot restarts and multiple instances.

  Collection: sessions
    {
      chatId: number,          // Telegram chat ID (unique, indexed)
      messages: LlmMessage[],  // conversation history as subdocuments
      updatedAt: Date          // last activity timestamp
    }
*/

import mongoose, { Schema, type Model, type Document } from "mongoose";
import { config } from "../config";
import type { LlmMessage } from "./llm";

/*
  Mongoose document interface for a chat session.
  Extends Document so Mongoose gives us .save(), .remove(), etc.
*/
interface ISession extends Document {
  chatId: number;
  messages: LlmMessage[];
  updatedAt: Date;
}

/*
  Subdocument schema for each message in the conversation.
  Must match the LlmMessage type so the LLM loop receives properly shaped data.
*/
const messageSchema = new Schema<LlmMessage>(
  {
    role: { type: String, required: true, enum: ["system", "user", "assistant", "tool"] },
    content: { type: String, default: null },
    tool_calls: [
      {
        id: String,
        type: { type: String, default: "function" },
        function: {
          name: String,
          arguments: String,
        },
      },
    ],
    tool_call_id: String,
  },
  { _id: false },
);

/*
  Top-level session schema.
  The unique index on chatId ensures we can upsert without races.
*/
const sessionSchema = new Schema<ISession>({
  chatId: { type: Number, required: true, unique: true, index: true },
  messages: { type: [messageSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

/*
  Compiled model. Using a cached variable to avoid
  "Cannot overwrite model once compiled" in watch mode.
*/
let SessionModel: Model<ISession>;

function getSessionModel(): Model<ISession> {
  if (!SessionModel) {
    SessionModel = mongoose.model<ISession>("Session", sessionSchema);
  }
  return SessionModel;
}

/*
  Connect to MongoDB and wait for the connection to be ready.
  Mongoose handles buffering internally, but we explicitly await
  so the bot doesn't start polling Telegram before the DB is reachable.
*/
export async function connectDb(): Promise<void> {
  await mongoose.connect(config.mongo.uri, {
    dbName: config.mongo.dbName,
  });
}

/*
  Gracefully close the Mongoose connection.
  Called during shutdown to avoid hanging connections.
*/
export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

/*
  Retrieve messages for a given chat.
  Returns the raw message array (Mongoose document, but we treat it as plain data).
  If no session exists, returns null so the caller can create one.
*/
export async function getSessionMessages(
  chatId: number,
): Promise<LlmMessage[] | null> {
  const Model = getSessionModel();
  const session = await Model.findOne({ chatId }).lean();

  /*
    lean() returns a plain JS object instead of a Mongoose document.
    This avoids issues with Mongoose getters/setters when passing
    messages directly to the OpenRouter API.
  */
  if (!session) return null;
  return session.messages as LlmMessage[];
}

/*
  Save (insert or overwrite) the full message array for a chat.
  Uses findOneAndUpdate with upsert so we don't need separate create vs update logic.
*/
export async function saveSessionMessages(
  chatId: number,
  messages: LlmMessage[],
): Promise<void> {
  const Model = getSessionModel();
  await Model.findOneAndUpdate(
    { chatId },
    {
      $set: {
        chatId,
        messages,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

/*
  Delete a session entirely.
  Used by /reset to wipe the conversation clean.
*/
export async function deleteSession(chatId: number): Promise<void> {
  const Model = getSessionModel();
  await Model.deleteOne({ chatId });
}
