/*
  Simple in-memory conversation session manager.

  Why in-memory and not a database:
    - No setup required (no Postgres/Redis)
    - Stateless is not practical here because the LLM needs conversation context
    - For a bot used by a small group of people, memory is perfectly fine

  How it works:
    - Each Telegram chat gets its own array of messages
    - When the array exceeds maxMessages, old messages are pruned from the front
    - System prompt is always at position 0 and is never pruned
    - The whole thing resets when the bot restarts (acceptable for this scale)
*/

import type { LlmMessage } from "../utils/llm";
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
    "4. Consider net run rate implications\n" +
    "5. Be realistic about a team's chances\n" +
    "6. Use get_match_detail when you need detailed scorecard info\n" +
    "7. Use search_series to find info about a tournament\n\n" +
    "Data:\n" +
    "- get_cric_score shows matches from approximately the last 7 days and next 7 days\n" +
    "- get_cached_results shows ALL matches accumulated since the bot started running\n" +
    "- The cache grows each time get_cric_score is called, so over time it builds a full picture\n" +
    "- If the cache is empty, explain to the user that the bot just started and needs time to accumulate data\n" +
    "- The series list mainly contains international tours, not T20 leagues like IPL\n\n" +
    "Be conversational, enthusiastic about cricket, and format your responses for Telegram " +
    "(use line breaks, bold with *asterisks*, and keep messages concise).",
};

export class SessionManager {
  private sessions: Map<number, LlmMessage[]> = new Map();

  /*
    Get or create the message history for a given Telegram chat.
    The system prompt is always at index 0.
  */
  getMessages(chatId: number): LlmMessage[] {
    let messages = this.sessions.get(chatId);
    if (!messages) {
      messages = [SYSTEM_PROMPT];
      this.sessions.set(chatId, messages);
    }
    return messages;
  }

  /*
    Add a new message to the chat's history.
    If adding this message would exceed maxMessages (after the system prompt),
    we remove the oldest user/assistant/tool messages to make room.
  */
  addMessage(chatId: number, message: LlmMessage): void {
    const messages = this.getMessages(chatId);
    messages.push(message);

    /*
      Keep the system prompt (index 0) and at most maxMessages of history.
      Prune from index 1 onward.
    */
    if (messages.length > config.session.maxMessages + 1) {
      const excess = messages.length - (config.session.maxMessages + 1);
      /*
        Remove excess messages, but always keep the system prompt at [0].
        We splice from index 1, removing 'excess' items.
      */
      messages.splice(1, excess);
    }
  }

  /*
    Reset a chat's history (e.g. if the user types /reset).
  */
  resetChat(chatId: number): void {
    this.sessions.set(chatId, [SYSTEM_PROMPT]);
  }
}
