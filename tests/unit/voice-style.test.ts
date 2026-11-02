import { describe, expect, it } from "vitest";
import { features, normFrom, profileFrom, voiceDelta } from "../../scripts/eval/voice-style";

const casual = [
  "aye no bother, i'll be there about 7. you want me to bring anything? lol",
  "haha that's mad. i'm knackered tbh, work was a nightmare today",
  "nah i can't sat, it's my mate's birthday. sunday maybe?",
  "omg yes!! i've been waiting ages for that. what time you thinking",
];
const formal = [
  "Dear Ms Grant, I am writing to request a meeting regarding my module choices for next term.",
  "Thank you for your assistance. I look forward to hearing from you at your earliest convenience.",
  "I would be grateful if you could confirm the arrangements; furthermore, please advise on the next steps.",
  "Kind regards. Please do not hesitate to contact me should you require any further information.",
];

describe("voice style", () => {
  const norm = normFrom([...casual, ...formal]);
  const casualProfile = profileFrom(casual);

  it("counts habits per 100 words", () => {
    const f = features("i can't. i won't! really?");
    expect(f["contractions"]).toBeCloseTo(40);
    expect(f["lower-case i"]).toBeCloseTo(40);
    expect(f["exclamations"]).toBeCloseTo(20);
    expect(f["lower-case starts"]).toBe(100);
  });

  it("is zero for a profile made from the text itself", () => {
    expect(voiceDelta(casual[0]!, profileFrom([casual[0]!]), norm)).toBeCloseTo(0);
  });

  it("puts an unseen casual message closer to the casual writer than a formal letter", () => {
    const unseenCasual = "nah mate i'm skint till friday, can we do next week instead? sorry";
    const unseenFormal = "I am writing to inform you that I will be unable to attend the meeting on Friday.";
    expect(voiceDelta(unseenCasual, casualProfile, norm)).toBeLessThan(voiceDelta(unseenFormal, casualProfile, norm));
  });

  it("does not treat the word 'it' or 'in' as a lower-case i", () => {
    expect(features("it is in the bin")["lower-case i"]).toBe(0);
  });
});
