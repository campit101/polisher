// The "plain AI rewrite" side of the blind comparison (T9, Cam's choice 15 Oct): the same model and
// the same writing samples as Polisher, asked the way a person would ask a chatbot, with no voice
// profile, no rules and no clean-up. Development only, polisher-test only.

/** The parts of a Messages API response read here (same shape as the rewrite function's). */
export interface BaselineMessage {
  content: { type: string; text?: string }[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export function baselineRequest(samples: string[], draft: string) {
  const examples = samples.map((s) => `<sample>\n${s}\n</sample>`).join("\n\n");
  return {
    // The model and settings Polisher's own calls had when the T9 pairs were made (Haiku 5.5, a unit test checks).
    model: "claude-haiku-5-5",
    thinking: { type: "disabled" },
    max_tokens: 8192,
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: `Here are some examples of my writing:\n\n${examples}\n\nRewrite the draft below so it sounds like me. Reply with the rewritten text only.\n\n<draft>\n${draft}\n</draft>`,
      },
    ],
  };
}

export type BaselineResult = { ok: true; text: string } | { ok: false; reason: "cut_off" | "empty" };

export function parseBaseline(message: BaselineMessage): BaselineResult {
  if (message.stop_reason === "max_tokens") return { ok: false, reason: "cut_off" };
  const text = message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  return text ? { ok: true, text } : { ok: false, reason: "empty" };
}
