// Every word on the landing page. tests/unit/site-copy.test.ts checks all of it with the same
// rules the product uses, except `specimen`, which shows AI habits on purpose.
import { site } from "@/config/site";
import { usage } from "@/config/usage";

/** The hero example: an AI draft, with the parts the clean-up step catches marked as tells. */
export const specimen: { text: string; tell?: true }[] = [
  { text: "Hi Sarah,\n\n" },
  { text: "I hope this email finds you well. ", tell: true },
  { text: "I wanted to confirm that we've " },
  { text: "finalized", tell: true },
  { text: " the " },
  { text: "color", tell: true },
  { text: " scheme for your new shopfront" },
  { text: " — ", tell: true },
  { text: "and I think you're going to love it. " },
  { text: "Moreover", tell: true },
  { text: ", our team will " },
  { text: "leverage", tell: true },
  { text: " your existing branding " },
  { text: "in order to", tell: true },
  { text: " give your customers a " },
  { text: "seamless", tell: true },
  { text: " experience.\n\n" },
  { text: "Feel free to reach out", tell: true },
  { text: " with any questions!" },
];

export const landing = {
  title: `${site.name}: ${site.tagline}`,
  description:
    "A working demo. Paste an AI draft and get it back in your own voice, with the AI habits taken out and the spelling in British or American English. Test payments only.",
  tool: {
    label: "Try Polisher",
    // The same tool as the Write page (Cam, 16 Oct), with Create rewrite locked until signing in.
    writingButton: (answered: number) => `Your writing (${answered}/3)`,
    writingTitle: "Your writing",
    locked: "Start a demo account to unlock",
    required: "required",
    complete: "done",
    done: "Done",
    goToWriting: "Open Your writing",
    draftLabel: "Paste an AI draft",
    placeholder: "Paste a draft from ChatGPT, Gemini, Copilot or anything else",
    writingIntro:
      "Answer at least 3 of these in your own words, the way you'd write to a friend. Polisher learns your voice from them. They stay in this browser until you start a demo account.",
    progress: (answered: number, words: number) => `${answered} of 3 answered, ${words} words so far (${site.tasteMinWords} needed)`,
    needWriting: "Answer at least 3 of the questions under Your writing first, so Polisher can learn your voice.",
    button: "Rewrite",
    // Strangers see the try is free before they start (Cam, 21 Oct).
    free: `Your first rewrite is free, with no account. Free drafts can be up to ${usage.free.draftMaxWords} words, or ${site.draftMaxWords.toLocaleString("en-GB")} with the demo plan.`,
    signInButton: "Start a demo account for another rewrite",
    checking: "Checking you're a person. This takes a second or two.",
    working: "Rewriting. This usually takes 10 to 30 seconds.",
    signedIn: "You're in a demo account, so your samples and rewrites live on the Write page.",
    openApp: "Open the Write page",
    // One free try per browser (Cam, 16 Oct); the second rewrite needs an account.
    used: "You've had your free try. Start a demo account for another rewrite.",
    botFailed: "We couldn't check you're a person. Reload the page and try again.",
    resultHeading: "Your rewrite",
    after: {
      heading: "Like it? Start a demo account to keep going",
      unlockHeading: "Start a demo account to unlock Create rewrite",
      usedHeading: "You've had your free try. Start a demo account for another rewrite",
      // What a demo account gives.
      items: [
        { title: "Another rewrite", body: "Your answers are saved as writing samples, so your next rewrite is ready to go." },
        { title: "Create rewrite unlocked", body: "Jot down your own rough notes and Polisher writes them up as a finished message in your own words." },
      ],
      body: "Press Start a demo account. There is no email address and no password, and the account is deleted after 24 hours.",
      close: "Not now",
    },
  },
  hero: {
    heading: site.tagline,
    // Cam's wording, 16 Oct; "watermarks" became "AI phrasing and formatting" (launch decision 7).
    intro: "Paste a draft from any AI. Polisher rewrites it in your own voice and strips out the usual AI phrasing and formatting.",
    windowTitle: "Polisher",
    beforeLabel: "AI draft",
    afterLabel: "After the clean-up",
    changesPrefix: "Changes in this example:",
    caption:
      "This is the clean-up step on its own, run by the same code as the product. Struck-through text is what it catches. A full rewrite also matches the samples you give it.",
  },
  steps: {
    heading: "How it works",
    items: [
      {
        title: `Add ${site.samples.min} to ${site.samples.max} samples`,
        body: `Emails, posts or notes you wrote yourself, ${site.samples.minTotalWords} words or more in total (the more you add, the more Polisher has to go on), or your answers to a few short questions. Polisher picks up your sentence length, word choice and tone from them.`,
      },
      {
        title: "Paste an AI draft",
        body: `Up to ${site.draftMaxWords.toLocaleString("en-GB")} words from ChatGPT, Gemini, Copilot or anything else.`,
      },
      {
        title: "Get it back in your voice",
        body: "Rewritten to sound like your samples, with a short list of what changed so you can check it.",
      },
    ],
    // The four draft types, explained here instead of in small ? badges on the tool (Cam, 16 Oct).
    kindsHeading: "Pick what it is",
    kindsIntro: "Polisher writes each type a little differently. It suggests one from your draft, and you can pick another.",
  },
  removes: {
    heading: "What it takes out",
    items: [
      {
        title: "Common AI phrasing and formatting",
        body: "An example is long dashes. AI text is full of them and most people never type one. They become commas or plain words.",
      },
      {
        title: "Stock phrases",
        // The count is filled in from the real list when the page renders.
        body: "{count} worn-out openers, fillers and sign-offs are cut or swapped for plain English.",
      },
      {
        title: "Spelling toggle",
        body: "Choose British or American English in Settings, and every rewrite comes back spelt your way. Names and quotations are left alone.",
      },
    ],
  },
  pricing: {
    heading: "Price",
    intro: "A demo of a £5 a month plan. Nothing is sold and no real money moves.",
    students: "Demo checkout: Stripe test mode only",
    planName: site.name,
    price: site.priceLabel,
    amount: "£5",
    period: "a month",
    cta: "Try the demo checkout",
    // Shown instead of the button to someone already subscribed (Cam, 16 Oct).
    subscribed: "Subscribed",
    manage: "Manage it on your Account page",
    points: [
      // The free rewrites are not part of the paid plan, so they are not listed here (Cam, 16 Oct).
      // How a credit is counted is in the questions, so the card stays short (Cam, 17 Oct).
      `${usage.credits.monthly} credits a month, up to ${usage.credits.daily} a day`,
      `Drafts of up to ${site.draftMaxWords.toLocaleString("en-GB")} words`,
      "Only Stripe's test card works: 4242 4242 4242 4242",
      "Nothing is charged, refunded or renewed for real",
    ],
    note: "Stripe Checkout in test mode. Use card 4242 4242 4242 4242, any future expiry date and any 3-digit CVC.",
  },
  faq: {
    heading: "Questions",
    items: [
      {
        q: "Is this a real product?",
        a: "No. Polisher is a working demo made by Cameron Pittaway. It used to be a £5 a month product, and it is now a portfolio piece. Nothing is sold, and a banner on every page says so.",
      },
      {
        q: "How do I get an account?",
        a: "Press Start a demo account. It makes a throwaway account with no email address and no password to remember. It is deleted automatically after 24 hours, with everything in it. No emails are ever sent.",
      },
      {
        q: "Do you keep my writing?",
        a: "Your samples are stored in Supabase (London) so you don't have to paste them again, and they are deleted with your demo account after 24 hours. You can edit or delete them sooner. Polisher's servers never save your drafts or rewrites (your last 5 rewrites stay in History, in your own browser, until you clear it). To make a rewrite, your draft and samples are sent to Anthropic, the company that runs the AI.",
      },
      {
        q: "Which AI does the rewriting?",
        a: "Claude Haiku 5.5, made by Anthropic. All visitors share a small daily AI budget of £0.10. When the day's budget is used up, the site shows ready-made example rewrites instead, until midnight UTC. The clean-up step afterwards is plain code with no AI in it.",
      },
      {
        q: "Does the payment work?",
        a: "It is a demo of Stripe Checkout in test mode. Only Stripe's test card works: 4242 4242 4242 4242, with any future expiry date and any 3-digit CVC. No real money moves, and nothing is charged, refunded or renewed for real.",
      },
      {
        q: "Does it work for American English?",
        a: "Yes. British English is the default. To switch, open Settings (the gear at the top of the page), choose Writing and pick American.",
      },
      {
        q: "How much can I use it?",
        a: `A demo subscription includes ${usage.credits.monthly} credits a month, and you can use up to ${usage.credits.daily} of them in a day. Credits are used by the word: 1 credit is ${usage.credits.wordsPerCredit} words, so a 250-word draft uses 2.5 credits, and each rewrite counts at least ${usage.credits.minWords} words (half a credit). Drafts can be up to ${site.draftMaxWords.toLocaleString("en-GB")} words. A rewrite that fails uses none. The daily count resets at midnight UK time. Your account shows how much you have left.`,
      },
      {
        q: "Can I use Polisher for coursework or exams?",
        a: "No. Polisher is for everyday writing such as emails, messages and posts. Don't use it for coursework, exams or any other work you must do yourself.",
      },
      {
        q: "What if I don't like a rewrite?",
        a: "Edit it or run it again.",
      },
    ],
  },
};
