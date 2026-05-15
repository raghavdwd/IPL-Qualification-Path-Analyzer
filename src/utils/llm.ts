/*
  OpenRouter client using the OpenAI-compatible chat completions endpoint.
  Includes the tool-calling loop that:
    1. Sends messages + tools to the LLM
    2. If the LLM requests tool calls, executes each one via the provided callback
    3. Feeds tool results back to the LLM
    4. Repeats until the LLM returns a text response or hits the iteration limit

  This keeps the tool dispatch logic in one place so the Telegram bot handler
  doesn't need to worry about the back-and-forth protocol.
*/

import { config } from "../config";

/*
  Represents a single message in the conversation history.
  This matches the OpenAI chat completion message format used by OpenRouter.
*/
export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

/*
  A tool definition in OpenAI-compatible function-calling format.
  The LLM uses the name + description to decide when to call it,
  and the parameters JSON Schema to know what arguments to provide.
*/
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const OPENROUTER_URL = `${config.openRouter.baseUrl}/chat/completions`;

/*
  Execute the full tool-calling loop.

  Steps:
    1. Build the request body with messages and tools
    2. POST to OpenRouter
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
    const body: Record<string, unknown> = {
      model: config.openRouter.model,
      messages,
    };

    /*
      Only attach tools array if we actually have tools defined.
      Some models behave differently when tools are present vs absent.
    */
    if (tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openRouter.apiKey}`,
        "HTTP-Referer": "https://github.com/raghav/ipl-win-prediction",
        "X-Title": "IPL Win Prediction Bot",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return `Sorry, I encountered an error talking to the AI provider: ${response.status} ${response.statusText}\n\n${errorText.slice(0, 500)}`;
    }

    const data = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };
    const choice = data.choices?.[0];

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
    */
    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      const assistantMessage: LlmMessage = {
        role: "assistant",
        content: null,
        tool_calls: choice.message.tool_calls,
      };
      messages.push(assistantMessage);

      /*
        Execute each tool call sequentially.
        The LLM might request multiple independent calls in one response.
        We could run them in parallel for speed, but sequential is simpler
        and avoids race conditions with API rate limits.
      */
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== "function") continue;

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
