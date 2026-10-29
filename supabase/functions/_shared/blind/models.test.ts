import { describe, expect, it } from "vitest";
import { profileRequest, rewriteRequest, type ApiMessage } from "../rewrite/prompts.ts";
import { callCostNano } from "../usage.ts";
import { compareRewrite, forModel, MODEL_IDS } from "./models.ts";

const samples = [
  "Had a nightmare with the bus this morning, it just never turned up so I walked in the rain and got there soaked. Sorted now though, dried off and had a coffee. Then the printer at work jammed twice so I had to go down a floor to use the other one, which took ages because everyone else had the same idea.",
  "I work in a supermarket on weekends, mostly on the tills and stacking shelves. It's busy but the people are sound and the shifts fly by when we're slammed. Before that I did a bit of everything, cleaning, a paper round and a summer helping my uncle with his van, so I'm used to early starts and long days.",
  "Thanks for asking me but I can't make it on Saturday, I've already said I'd help my mum move house. Have a good one and send me some photos after.",
];
const draft = "Hi Jamie, I hope you are well. I wanted to let you know I can't make football on Thursday at 7pm. Could we do Saturday instead?";

describe("forModel", () => {
  it("sends Sonnet's request as Polisher did from 16 to 29 October: between_tools at effort low", () => {
    const body = rewriteRequest("A profile of at least forty characters, plain and short.", draft);
    const sonnet = forModel(body, "sonnet");
    expect(sonnet.model).toBe("claude-sonnet-5-5");
    expect(sonnet.thinking).toEqual({ type: "between_tools" });
    expect(sonnet.output_config).toEqual({ ...body.output_config, effort: "low" });
    expect(forModel(body, "haiku")).toEqual(body);
  });

  it("changes only the model, thinking and effort for Haiku, back to how Polisher ran before", () => {
    const body = rewriteRequest("A profile of at least forty characters, plain and short.", draft);
    const haiku = forModel(body, "haiku");
    expect(haiku.model).toBe("claude-haiku-5-5");
    expect(haiku.thinking).toEqual({ type: "disabled" });
    expect(haiku.output_config).toEqual({ ...body.output_config, effort: "medium" });
    // Everything else is Polisher's own request, unchanged.
    expect({ ...haiku, model: body.model, thinking: body.thinking, output_config: body.output_config }).toEqual(body);
    const profile = forModel(profileRequest(samples), "haiku");
    expect(profile.model).toBe(MODEL_IDS.haiku);
    expect(profile.system).toBe(profileRequest(samples).system);
  });
});

const message = (text: string): ApiMessage => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});

describe("compareRewrite", () => {
  it("runs Polisher's profile and rewrite steps on the chosen model and prices them on it", async () => {
    const sent: { model: string; thinking: unknown }[] = [];
    const ai = (body: unknown) => {
      const b = body as { model: string; thinking: unknown; output_config: { format?: unknown } };
      sent.push({ model: b.model, thinking: b.thinking });
      return Promise.resolve(
        b.output_config.format
          ? message(JSON.stringify({ keep: ["Thursday", "7pm", "Saturday"], rewrite: "Can't do football Thursday at 7pm mate, Saturday instead?", formal: false }))
          : message("Short, plain sentences, casual tone, contractions, few commas, no exclamation marks."),
      );
    };
    const result = await compareRewrite({ ai, mock: false, samples, draft, model: "sonnet", clock: () => 0 });
    expect(sent).toEqual([
      { model: "claude-sonnet-5-5", thinking: { type: "between_tools" } },
      { model: "claude-sonnet-5-5", thinking: { type: "between_tools" } },
    ]);
    expect(MODEL_IDS).toEqual({ haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5" });
    expect(result.status).toBe("ok");
    expect(result.text).toContain("Saturday");
    expect(result.calls).toHaveLength(2);
    const each = callCostNano(message("x").usage, "claude-sonnet-5-5");
    expect(result.costNano).toBe(2 * each);
    expect(result.lost).toEqual({ numbers: 0, links: 0, quotes: 0 });
    // The eval scripts score the same Check these and change summary the Write page shows.
    expect(result.warnings?.numbers).toEqual([]);
    expect(Array.isArray(result.summary)).toBe(true);
  });

  it("counts lost numbers, so a critical meaning change shows up", async () => {
    const ai = (body: unknown) =>
      Promise.resolve(
        (body as { output_config: { format?: unknown } }).output_config.format
          ? message(JSON.stringify({ keep: [], rewrite: "Can't do football Thursday mate, how about Saturday instead then?", formal: false }))
          : message("Short, plain sentences, casual tone, contractions, few commas, no exclamation marks."),
      );
    const result = await compareRewrite({ ai, mock: false, samples, draft, model: "haiku", clock: () => 0 });
    expect(result.status).toBe("ok");
    expect(result.lost.numbers).toBe(1);
    expect(result.costNano).toBe(2 * callCostNano(message("x").usage, "claude-haiku-5-5"));
  });

  it("calls no AI in mock mode", async () => {
    const ai = () => Promise.reject(new Error("no AI in mock mode"));
    const result = await compareRewrite({ ai, mock: true, samples, draft, model: "sonnet", clock: () => 0 });
    expect(result.status).toBe("ok");
  });

  it("reports a refusal as a failure, with what it cost", async () => {
    const ai = (body: unknown) =>
      Promise.resolve(
        (body as { output_config: { format?: unknown } }).output_config.format
          ? { ...message(""), stop_reason: "refusal" }
          : message("Short, plain sentences, casual tone, contractions, few commas, no exclamation marks."),
      );
    const result = await compareRewrite({ ai, mock: false, samples, draft, model: "sonnet", clock: () => 0 });
    expect(result.status).toBe("refused");
    expect(result.costNano).toBeGreaterThan(0);
  });
});

describe("compareRewrite reuses the voice profile", () => {
  it("builds it once, then sends only the rewrite", async () => {
    let calls = 0;
    const ai = (body: unknown) => {
      calls++;
      return Promise.resolve(
        (body as { output_config: { format?: unknown } }).output_config.format
          ? message(JSON.stringify({ keep: ["Thursday", "7pm", "Saturday"], rewrite: "Can't do football Thursday at 7pm mate, Saturday instead?", formal: false }))
          : message("Short, plain sentences, casual tone, contractions, few commas, no exclamation marks."),
      );
    };
    const first = await compareRewrite({ ai, mock: false, samples, draft, model: "sonnet", clock: () => 0 });
    expect(calls).toBe(2);
    expect(first.profile).toContain("Short, plain sentences");
    const second = await compareRewrite({ ai, mock: false, samples, draft, model: "sonnet", profile: first.profile, clock: () => 0 });
    expect(calls).toBe(3);
    expect(second.calls.map((c) => c.kind)).toEqual(["rewrite"]);
    expect(second.costNano).toBe(callCostNano(message("x").usage, "claude-sonnet-5-5"));
  });
});
