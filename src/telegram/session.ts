/*
  Conversation session manager backed by MongoDB instead of in-memory storage.

  Benefits over the old in-memory Map:
    - Conversations survive bot restarts
    - Multiple bot instances can share the same session data
    - No memory leaks from abandoned chats

  Each chat gets its own document in the "sessions" collection.
  The system prompt is always at messages[0] and is never pruned.
  Old messages beyond maxMessages are trimmed from the front (after the system prompt).
*/

import type { LlmMessage } from "../utils/llm";
import {
  getSessionMessages,
  saveSessionMessages,
  deleteSession,
} from "../utils/db";
import { config } from "../config";

const SYSTEM_PROMPT: LlmMessage = {
  role: "system",
  content:
    "You are an IPL qualification path analyst bot running on Telegram. " +
    "Your job is to answer cricket fans' questions about how teams can qualify for the playoffs. " +
    "You have access to live cricket data APIs through your tools.\n\n" +
    "When analyzing qualification scenarios:\n" +
    "1. Call get_cached_results FIRST to see the full accumulated match history (grows over time)\n" +
    "2. Then call get_cric_score to get the latest live scores and recent results\n" +
    "3. Calculate points: 2 points for a win, 1 for tie/no result, 0 for loss\n" +
    "4. Consider net run rate implications (use web_search to look up current NRR from websites)\n" +
    "5. Use web_search to find up-to-date points tables, standings, and team news\n" +
    "6. Be realistic about a team's chances\n" +
    "7. Use get_match_detail when you need detailed scorecard info\n" +
    "8. Use search_series to find info about a tournament\n\n" +
    "Data:\n" +
    "- get_cric_score shows matches from approximately the last 7 days and next 7 days\n" +
    "- get_cached_results shows ALL matches accumulated since the bot started running\n" +
    "- The cache grows each time get_cric_score is called, so over time it builds a full picture\n" +
    "- If the cache is empty, explain to the user that the bot just started and needs time to accumulate data\n" +
    "- The series list mainly contains international tours, not T20 leagues like IPL\n" +
    "- web_search searches the web via Firecrawl for real-time info (standings, NRR, news, etc.)\n\n" +
    "Be conversational, enthusiastic about cricket, and format your responses for Telegram " +
    "(use line breaks, bold with *asterisks*, and keep messages concise).",
};

export class SessionManager {
  /*
    Retrieve the message history for a given Telegram chat from MongoDB.
    If no session exists, creates one with just the system prompt and persists it.
  */
  async getMessages(chatId: number): Promise<LlmMessage[]> {
    const stored = await getSessionMessages(chatId);
    if (stored) return stored;

    /*
      No session found in the database — this is a first-time user or a reset chat.
      Initialize with the system prompt and save immediately so subsequent calls
      don't race to create the same session.
    */
    const initial = [SYSTEM_PROMPT];
    await saveSessionMessages(chatId, initial);
    return initial;
  }

  /*
    Append a message to the chat's history and persist to MongoDB.
    Trims old messages beyond maxMessages (keeping the system prompt at index 0).
  */
  async addMessage(chatId: number, message: LlmMessage): Promise<void> {
    const messages = await this.getMessages(chatId);
    messages.push(message);

    /*
      Prune excess messages while always keeping the system prompt.
      If we have more than maxMessages + 1 (the +1 is the system prompt),
      remove the oldest user/assistant/tool messages from index 1 onward.
    */
    if (messages.length > config.session.maxMessages + 1) {
      const excess = messages.length - (config.session.maxMessages + 1);
      messages.splice(1, excess);
    }

    await saveSessionMessages(chatId, messages);
  }

  /*
    Wipe the chat's history and replace it with a fresh system prompt.
    Called when the user types /reset.
  */
  async resetChat(chatId: number): Promise<void> {
    await deleteSession(chatId);
    /*
      getMessages on the next call will create a fresh session with the system prompt.
      We pre-save here so getMessages doesn't need special empty-handling logic.
    */
    await saveSessionMessages(chatId, [SYSTEM_PROMPT]);
  }
}
