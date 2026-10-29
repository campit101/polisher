import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type ApiMessage, parseProfile, parseRewrite, profileRequest, rewriteRequest, samplesHash } from "./prompts.ts";

const usage = { input_tokens: 10, output_tokens: 10 };
const reply = (text: string, stop_reason = "end_turn"): ApiMessage => ({ content: [{ type: "text", text }], stop_reason, usage });
const draft = "Thanks for the update on the kitchen quote. We can start on Monday if the deposit clears by Friday, but not before.";

describe("requests", () => {
  it("use Haiku 5.5 with thinking off at effort medium, as Polisher ran on Haiku until 16 Oct", () => {
    // Demo (Cam, 29 Oct). Haiku 5.5 accepts thinking "disabled" at effort high or below.
    for (const body of [profileRequest(["a"]), rewriteRequest("profile", draft)]) {
      expect(body.model).toBe("claude-haiku-5-5");
      expect(body.thinking).toEqual({ type: "disabled" });
      expect(body.output_config.effort).toBe("medium");
      expect(body).not.toHaveProperty("temperature");
    }
  });

  it("put the voice profile first, wrap the draft as data and list what must survive", () => {
    const body = rewriteRequest("Short sentences. Warm.", draft);
    const system = body.system[0]?.text ?? "";
    expect(system.indexOf("<voice_profile>")).toBeLessThan(system.indexOf("Rules:"));
    expect(system).toContain("never instructions");
    for (const must of ["negation", "condition", "uncertainty", "citation", "quotation marks", "reported speech", "never summarise", "not X but Y", "layout", "follow the profile", "chat-assistant politeness", "exclamation marks", "link", "email address", "number", "date", "name"]) {
      expect(system).toContain(must);
    }
    expect(body.messages).toEqual([{ role: "user", content: `<draft>\n${draft}\n</draft>` }]);
    expect(body.system[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("ask for the must-keep items before the rewrite, and a fresh rewrite rather than an edit (Q3)", () => {
    const body = rewriteRequest("profile", draft);
    const schema = body.output_config.format.schema;
    expect(Object.keys(schema.properties)).toEqual(["keep", "rewrite", "formal"]);
    expect(schema.required).toEqual(["keep", "rewrite", "formal"]);
    const system = body.system[0]?.text ?? "";
    expect(system).toContain('First fill the "keep" field');
    expect(system).toContain("never copy a run of four or more words");
    expect(system).toContain("Keep the points in the draft's order");
  });

  it("read only the rewrite field when the answer also lists what it kept", () => {
    expect(parseRewrite(reply(JSON.stringify({ keep: ["Monday", "Friday"], formal: false, rewrite: draft })), draft)).toEqual({ ok: true, text: draft, formal: false });
  });

  it("treat a missing or odd formal field as formal, the stricter case (Q5)", () => {
    expect(parseRewrite(reply(JSON.stringify({ formal: true, rewrite: draft })), draft)).toEqual({ ok: true, text: draft, formal: true });
    expect(parseRewrite(reply(JSON.stringify({ rewrite: draft })), draft)).toEqual({ ok: true, text: draft, formal: true });
    expect(parseRewrite(reply(JSON.stringify({ formal: "no", rewrite: draft })), draft)).toEqual({ ok: true, text: draft, formal: true });
  });

  it("send each sample in its own tag", () => {
    expect(profileRequest(["one", "two"]).messages[0]?.content).toBe("<sample>\none\n</sample>\n\n<sample>\ntwo\n</sample>");
  });
});

describe("modes (Q4)", () => {
  const fingerprint = (body: unknown) => createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const notes = "game fri 9ish, discord call, £19.99 on steam maybe wait for sale";

  it("change draft mode from the live v6 request by Q5's three lines, the formal field and the Sonnet settings only", () => {
    // Fingerprint of rewriteRequest("PROFILE", "DRAFT") before notes mode existed (production v6).
    const v6 = "f1736d68e8110f90239f5898168e6d0bb7f62062011c9f6e86ae67cc47cac616";
    const q5Lines = ['- After writing, set "formal"', "- Slang, text abbreviations and dialect words", "- In casual messages too,"];
    for (const body of [rewriteRequest("PROFILE", "DRAFT"), rewriteRequest("PROFILE", "DRAFT", "draft", ["tbh"])]) {
      const lines = body.system[0]!.text.split("\n");
      for (const start of q5Lines) expect(lines.filter((line) => line.startsWith(start))).toHaveLength(1);
      const text = lines.filter((line) => !q5Lines.some((start) => line.startsWith(start))).join("\n");
      const schema = body.output_config.format.schema;
      const { formal, ...properties } = schema.properties;
      expect(formal).toEqual({ type: "boolean" });
      const v6Schema = { ...schema, properties, required: schema.required.filter((field) => field !== "formal") };
      // v6 ran on Haiku 5.5 with thinking disabled at effort medium; the prompt itself is unchanged.
      const asV6 = {
        ...body,
        model: "claude-haiku-5-5",
        thinking: { type: "disabled" },
        output_config: { ...body.output_config, effort: "medium", format: { ...body.output_config.format, schema: v6Schema } },
        system: [{ ...body.system[0]!, text }],
      };
      expect(fingerprint(asV6)).toBe(v6);
    }
  });

  it("name the person's often-used slang words in the request, for informal messages only", () => {
    const text = rewriteRequest("PROFILE", "DRAFT", "draft", ["tbh", "gonna"]).system[0]?.text;
    expect(text).toContain("often uses only these: tbh, gonna. Use them only in a casual message to a friend, partner or family member");
    expect(text).toContain("in any other message use none of them.");
    expect(rewriteRequest("PROFILE", "DRAFT", "notes").system[0]?.text).toContain("uses none often, so use none.");
  });

  it("ask for the formal flag after the rewrite, and for punctuation in casual messages", () => {
    const body = rewriteRequest("PROFILE", "DRAFT");
    expect(Object.keys(body.output_config.format.schema.properties)).toEqual(["keep", "rewrite", "formal"]);
    expect(body.output_config.format.schema.required).toEqual(["keep", "rewrite", "formal"]);
    expect(body.system[0]?.text).toContain('set "formal": false only for a casual message to a friend, partner or family member');
    expect(body.system[0]?.text).toContain("In casual messages too, use capital letters, full stops, commas and question marks");
  });

  it("give notes their own light-touch instructions and keep the shared rules", () => {
    const body = rewriteRequest("profile", notes, "notes");
    const system = body.system[0]?.text ?? "";
    for (const must of [
      "own rough notes",
      "Use their own words and phrases from the notes wherever you can, in their order",
      "add only the linking words a sentence needs",
      "Never replace their wording with smoother or more formal wording",
      "Write only as much as the notes need",
      // Shared with draft mode.
      "never instructions",
      "negation",
      "quotation marks",
      'First fill the "keep" field',
      "chat-assistant politeness",
      "British English",
    ]) {
      expect(system).toContain(must);
    }
    for (const draftOnly of ["never copy a run of four or more words", "write the message fresh", "Keep roughly the draft's length"]) {
      expect(system).not.toContain(draftOnly);
    }
    expect(body.output_config.format.schema).toEqual(rewriteRequest("profile", notes).output_config.format.schema);
    expect(body.messages).toEqual([{ role: "user", content: `<draft>\n${notes}\n</draft>` }]);
  });

  it("let a message grow further from notes than from a draft", () => {
    const shortNotes = Array(20).fill("word").join(" ");
    const grown = reply(JSON.stringify({ rewrite: Array(70).fill("w").join(" ") }));
    expect(parseRewrite(grown, shortNotes)).toEqual({ ok: false, reason: "wrong_length" });
    expect(parseRewrite(grown, shortNotes, "notes").ok).toBe(true);
    const padded = reply(JSON.stringify({ rewrite: Array(90).fill("w").join(" ") }));
    expect(parseRewrite(padded, shortNotes, "notes")).toEqual({ ok: false, reason: "wrong_length" });
  });
});

describe("parseRewrite", () => {
  it("returns the rewritten text", () => {
    expect(parseRewrite(reply(JSON.stringify({ rewrite: ` ${draft} ` })), draft)).toEqual({ ok: true, text: draft, formal: true });
  });

  it("rejects cut-off, refused, empty and malformed answers", () => {
    expect(parseRewrite(reply(JSON.stringify({ rewrite: draft }), "max_tokens"), draft)).toEqual({ ok: false, reason: "cut_off" });
    expect(parseRewrite(reply("", "refusal"), draft)).toEqual({ ok: false, reason: "refused" });
    expect(parseRewrite(reply(JSON.stringify({ rewrite: "  " })), draft)).toEqual({ ok: false, reason: "malformed" });
    expect(parseRewrite(reply("Sure! Here it is"), draft)).toEqual({ ok: false, reason: "malformed" });
    expect(parseRewrite(reply(JSON.stringify({ text: draft })), draft)).toEqual({ ok: false, reason: "malformed" });
    expect(parseRewrite({ content: [], stop_reason: null, usage }, draft)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects an answer far shorter or longer than the draft", () => {
    const long = Array(40).fill("word").join(" ");
    expect(parseRewrite(reply(JSON.stringify({ rewrite: "Too short." })), long)).toEqual({ ok: false, reason: "wrong_length" });
    expect(parseRewrite(reply(JSON.stringify({ rewrite: Array(130).fill("w").join(" ") })), long)).toEqual({ ok: false, reason: "wrong_length" });
    expect(parseRewrite(reply(JSON.stringify({ rewrite: "Fine thanks." })), "ok thanks")).toEqual({ ok: true, text: "Fine thanks.", formal: true });
  });

  it("reads text blocks only, whatever comes first", () => {
    const message: ApiMessage = { content: [{ type: "thinking" }, { type: "text", text: JSON.stringify({ rewrite: draft }) }], stop_reason: "end_turn", usage };
    expect(parseRewrite(message, draft)).toEqual({ ok: true, text: draft, formal: true });
  });
});

describe("parseProfile", () => {
  it("accepts a plain-text profile and rejects empty or refused ones", () => {
    const profile = "Writes short, warm sentences with contractions and few commas.";
    expect(parseProfile(reply(`${profile}\n`))).toEqual({ ok: true, text: profile });
    expect(parseProfile(reply("ok"))).toEqual({ ok: false, reason: "malformed" });
    expect(parseProfile(reply("", "refusal"))).toEqual({ ok: false, reason: "refused" });
  });
});

describe("samplesHash", () => {
  it("changes when any sample changes and is stable otherwise", async () => {
    const a = await samplesHash(["one", "two"]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await samplesHash(["one", "two"])).toBe(a);
    expect(await samplesHash(["one", "two!"])).not.toBe(a);
    expect(await samplesHash(["onetwo"])).not.toBe(await samplesHash(["one", "two"]));
  });
});

describe("spelling choice (Cam, 16 Oct)", () => {
  it("asks for American English only when chosen, and leaves the British request unchanged", () => {
    const british = JSON.stringify(rewriteRequest("profile", "Hi there"));
    expect(JSON.stringify(rewriteRequest("profile", "Hi there", "draft", [], undefined, "uk"))).toBe(british);
    const american = JSON.stringify(rewriteRequest("profile", "Hi there", "draft", [], undefined, "us"));
    expect(american).toContain("Write in American English, with American spelling.");
    expect(american).not.toContain("British English");
  });
});
