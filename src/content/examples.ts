// Ready-made examples, shown when the shared daily AI budget is used up (demo, 29 Oct 2026).
// Real Polisher output, copied word for word: made-up AI drafts from tests/fixtures/eval/q1/drafts.json,
// rewritten by Polisher on Claude Haiku 5.5 in blind comparison 2 on 16 Oct 2026 (polisher-test,
// blind_pairs set model-compare), in the voice of made-up writing samples. Nothing here is a real person.

export type ReadyMadeExample = {
  id: string;
  title: string;
  draft: string;
  rewrite: string;
};

export const readyMadeExamples: readonly ReadyMadeExample[] = [
  {
    id: "f8-gym-cancel",
    title: "A formal email",
    draft:
      "Dear Membership Team,\n\nI am writing to formally request the cancellation of my gym membership, membership number GM-209184. Due to changes in my work schedule, I am no longer able to attend regularly, and I feel it would be best to end my membership at this time.\n\nI understand that your terms require 30 days' notice, so I would be grateful if you could confirm that my final payment will be taken on 1 November and that no further payments will be collected after that date.\n\nThank you for providing such a welcoming environment over the past year. I have genuinely enjoyed being a member.\n\nKind regards,\nAlex",
    rewrite:
      "Hi Membership Team, I need to cancel my gym membership, number GM-209184. My work hours changed and I can't get to the gym regularly anymore, so I think it's best to end it now. I know your terms need 30 days' notice, so could you confirm the last payment comes out on 1 November and nothing gets taken after that? Thanks for the past year, the gym's been good and I've actually enjoyed being a member. Alex",
  },
  {
    id: "c4-bills",
    title: "A message to housemates",
    draft:
      "Hey guys, quick one about the bills for this month. I've gone through everything and here's the breakdown: the electricity came to £84.30 and the wifi was £27, which brings the total to £111.30. Split three ways, that works out at £37.10 each. If you could send your share to me by Friday, that would be really helpful, as the direct debit comes out on Monday. Additionally, I noticed the electricity is noticeably higher than last month, so it might be worth being a bit more mindful about leaving the heating on. Thanks so much, I really appreciate it!",
    rewrite:
      "Bills for this month are sorted. Electricity was £84.30 and the wifi was £27 so that's £111.30 altogether.\n\nSplit three ways it's £37.10 each. Can you send me yours by Friday? The direct debit comes out on Monday.\n\nAlso the electricity is quite a bit higher than last month, so maybe go easy on leaving the heating on.",
  },
  {
    id: "c6-shift-swap",
    title: "A favour from a colleague",
    draft:
      "Hi Sophie, I hope you're having a good week! I was wondering if you'd be able to do me a huge favour. I'm currently down to work on Sunday from 10:00 to 16:00, but I've got a family event that I really can't miss. Would you be open to swapping your Tuesday shift for my Sunday one? I completely understand if it doesn't work for you, so no pressure at all. If you're able to help, I'll let the manager know and update the rota myself. Thanks so much in advance — I really appreciate it!",
    rewrite:
      "Sophie, can you do me a favour? I'm down to work Sunday 10:00 to 16:00 but I've got a family thing I can't miss. Would you be up for swapping your Tuesday shift for my Sunday one? Totally fine if it doesn't work for you. If you can, I'll let the manager know and update the rota myself. Thanks, I owe you one.",
  },
];
