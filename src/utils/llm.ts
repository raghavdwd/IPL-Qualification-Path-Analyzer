/*
  OpenAI-compatible LLM client using the official OpenAI SDK.
  
  Currently configured to talk to OpenRouter (which speaks the OpenAI protocol).
  Swap baseURL + apiKey to use any OpenAI-compatible provider.

  Exports the tool-calling loop that:
    1. Sends messages + tools to the LLM
    2. If the LLM requests tool calls, executes each one via the provided callback
    3. Feeds tool results back to the LLM
    4. Repeats until the LLM returns a text response or hits the iteration limit
*/

import OpenAI from "openai";
import { config } from "../config";

/*
  Re-export the SDK's canonical message and tool types so downstream code
  (session storage, tool definitions, bot handler) doesn't depend on a
  hand-rolled interface that can drift out of sync.
*/
export type LlmMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ToolDefinition = OpenAI.Chat.Completions.ChatCompletionTool;

/*
  Single shared client instance.
  The base URL points at OpenRouter; the extra headers are OpenRouter-specific
  metadata that shows up in their dashboard analytics.
*/
const client = new OpenAI({
  apiKey: config.openRouter.apiKey,
  baseURL: config.openRouter.baseUrl,
  defaultHeaders: {
    "HTTP-Referer":
      "https://github.com/raghavdwd/IPL-Qualification-Path-Analyzer.git",
    "X-Title": "IPL Qualification Path Analyzer",
  },
});

/*
  Execute the full tool-calling loop.

  Steps:
    1. Build the request body with messages and tools via the SDK
    2. POST to the configured provider
    3. Check finish_reason
       - "tool_calls": execute each call via toolExecutor, append results, go to step 2
       - "stop": return the content text
    4. If we exceed maxIterations, return a fallback message

  toolExecutor is a callback that receives (toolName, parsedArgs) and must return
  a JSON string that will be sent back to the LLM as the tool result.
*/
export async function chatLoop(
  messages: LlmMessage[],
  tools: ToolDefinition[],
  toolExecutor: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<string>,
  maxIterations = 10,
): Promise<string> {
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    /*
      Only attach the tools array if we have tools defined.
      Some models behave differently when tools are present vs absent.
    */
    const response = await client.chat.completions.create({
      model: config.openRouter.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    const choice = response.choices?.[0];

    /*
      Defensive check: if the API response is malformed, bail out gracefully.
    */
    if (!choice) {
      return "Sorry, I got an unexpected response from the AI. Please try again.";
    }

    /*
      When finish_reason is "tool_calls", the LLM wants us to run one or more tools.
      The assistant message with tool_calls must be added to the conversation history,
      followed by one "tool" role message per tool result.

      The OpenAI SDK v6 union type includes both standard "function" tool calls and
      custom tool calls; we filter to only handle function calls here.
    */
    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      const functionCalls = choice.message.tool_calls.filter(
        (
          tc,
        ): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
          type: "function";
        } => tc.type === "function",
      );

      messages.push({
        role: "assistant",
        content: choice.message.content || null,
        tool_calls: functionCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      });

      /*
        Execute each tool call sequentially.
        The LLM might request multiple independent calls in one response.
        We could run them in parallel for speed, but sequential is simpler
        and avoids race conditions with API rate limits.
      */
      for (const toolCall of functionCalls) {
        const name = toolCall.function.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          /*
            If the LLM generates invalid JSON in the arguments,
            send back an error so it can correct itself.
          */
          args = {
            error: "invalid JSON arguments",
            raw: toolCall.function.arguments,
          };
        }

        const result = await toolExecutor(name, args);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      /*
        Continue the loop. The tool results are now part of messages,
        so the next API call will include them.
      */
      continue;
    }

    /*
      finish_reason === "stop" (or anything else): extract the text and return it.
    */
    const content = choice.message?.content;
    if (content) {
      return content;
    }

    /*
      Edge case: finish_reason is "stop" but content is null/empty.
      This can happen with some models that return empty responses.
    */
    return "I processed your request but didn't generate a response. Please try asking in a different way.";
  }

  /*
    Safety valve: if the model keeps calling tools (e.g. gets stuck in a loop),
    we break out and return this fallback message.
  */
  return "I've reached the limit of my analysis steps. Please ask a more specific question or try again.";
}
