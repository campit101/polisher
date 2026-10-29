// The three legal pages, rewritten for the demo. Polisher sells nothing and takes no real money, so the
// pages say what the demo does with data, what the rules are, and why there is nothing to refund.
// Checked by tests/unit/site-copy.test.ts like the rest of the site's copy.
import { site } from "@/config/site";
import { usage } from "@/config/usage";

export interface LegalDoc {
  slug: "privacy" | "terms" | "refunds";
  title: string;
  summary: string;
  updated: string;
  sections: { heading: string; paragraphs: string[] }[];
}

// No postal address is shown anywhere: nothing is sold, so none is needed.
const who = `${site.name} is a working demo run by ${site.owner.name}, ${site.owner.town}. Email: ${site.owner.email}.`;

export const privacy: LegalDoc = {
  slug: "privacy",
  title: "Privacy notice",
  summary: "What the Polisher demo collects, why, who helps run it, and your rights.",
  updated: "29 October 2026",
  sections: [
    { heading: "Who is responsible", paragraphs: [who, "For UK data protection law, this person is the controller of your data.", "Please don't paste anything private or sensitive into this demo."] },
    {
      heading: "What we collect and why",
      paragraphs: [
        "Demo account: when you press Start a demo account, we make a throwaway account with no email address and no password. We keep when it was made, and how many free rewrites and credits it has used (counts and costs only, never your writing). The account and everything in it is deleted automatically after 24 hours.",
        "Writing samples and your style profile: stored in Supabase (London) so you don't have to paste them again. You can edit or delete them at any time, and they are deleted with the demo account after 24 hours.",
        "Drafts and rewrites: Polisher's servers do not save them. Your draft and samples are sent to Anthropic to make the rewrite. Your last 5 rewrites stay in your own browser, in History, until you clear it.",
        "Free try without an account: your answers to the questions stay only in your own browser until you start a demo account. To allow one free try, your browser keeps a small cookie for a year that says it has had it, holding only the time and a signature, and we keep a scrambled version of your internet address for a day.",
        "Payments: the £5 a month plan is a demo of Stripe Checkout in test mode. Only Stripe's test card works, so never type a real card number. Stripe sees only what you type into its test checkout. No real money moves, and nothing is charged for real.",
        "Usage: counts of AI words used and their cost, with no text, so the shared daily AI budget of £0.10 can be kept.",
        "Security records: our servers see your internet address. We keep only a scrambled version, to limit spam and abuse. Supabase keeps sign-in logs, including internet addresses, for security.",
        "Visits: page counts from Vercel Web Analytics and our own records, with no cookies and nothing that identifies you, plus a daily code to count different people. See Cookies and visit counting below, including how to switch this off.",
        "No emails are ever sent. Polisher makes no decisions about you by automated means that have legal or similarly significant effects.",
      ],
    },
    {
      heading: "Who helps run Polisher",
      paragraphs: [
        "Supabase stores the database, with the data held in London. Vercel hosts the website and counts visits. Anthropic makes the rewrites using Claude Haiku 5.5; that processing may take place outside the UK, including in the United States. Stripe runs the test checkout, in test mode only.",
        "Where these companies process data outside the UK, including in the United States, they rely on safeguards approved under UK law. Email us if you would like to know more.",
      ],
    },
    {
      heading: "Cookies and visit counting",
      paragraphs: [
        "Polisher uses cookies only to keep your demo account working and to remember that this browser has had its free try. They are needed for the site to work. Your browser also stores your theme, motion, spelling and visit counting choices if you change them in Settings, your answers to the free-try questions until you start a demo account, and your History (your last 5 rewrites and what you wrote for them) until you clear it. You can remove these by clearing this site's data in your browser. There are no advertising or tracking cookies, so there is no cookie banner.",
        "Visit counting: Vercel Web Analytics and our own counter record the pages visited, the link you came from, and your browser type and country, without cookies. To count how many different people visit, our counter also keeps a scrambled code made from your internet address and browser type. The code changes every day and cannot be turned back into your address, so it cannot be linked to you or to your visits on other days. To switch visit counting off, turn off Count my visits in Settings, or turn on Global Privacy Control in your browser.",
      ],
    },
    {
      heading: "How long we keep it",
      paragraphs: [
        "Demo accounts and their samples: deleted automatically after 24 hours. You can delete your account sooner from the Account page, which removes it straight away.",
        "Scrambled internet addresses: deleted within 30 days.",
        "Drafts and rewrites: not kept on our servers at all.",
      ],
    },
    {
      heading: "Your rights",
      paragraphs: [
        "You can ask for a copy of your data, have it corrected or deleted, ask us to restrict or stop using it, and take it elsewhere. Your account page lets you download your data and delete your account yourself.",
        `To ask for anything else, or to complain about how we handle your data, email ${site.owner.email}.`,
        "You can also complain to the Information Commissioner's Office at ico.org.uk or on 0303 123 1113.",
      ],
    },
    { heading: "Changes", paragraphs: ["If this notice changes, the date at the top changes too."] },
  ],
};

export const terms: LegalDoc = {
  slug: "terms",
  title: "Terms",
  summary: "The rules for using the Polisher demo.",
  updated: "29 October 2026",
  sections: [
    { heading: "What this is", paragraphs: [who, "Polisher is a demo for showing how the product works. Nothing is sold, and there are no real customers."] },
    {
      heading: "The service",
      paragraphs: [
        "Polisher rewrites text you paste so it reads more like the writing samples you provide, then removes common AI habits and uses British spelling.",
        "Rewrites are made by AI and can contain mistakes. Check every rewrite before you use it. You are responsible for what you send or publish.",
        "The demo is provided as it is. It may change, be slow, or be switched off at any time.",
      ],
    },
    {
      heading: "Demo accounts",
      paragraphs: ["Press Start a demo account to make a throwaway account. It has no email address and no password, and it is deleted automatically after 24 hours with everything in it."],
    },
    {
      heading: "AI use and the daily budget",
      paragraphs: [
        "Real rewrites are made by Claude Haiku 5.5, made by Anthropic. All visitors share a small daily AI budget of £0.10. When the day's budget is used up, the site shows ready-made example rewrites instead, until midnight UTC.",
        `Free drafts can be up to ${usage.free.draftMaxWords} words. Free rewrites share a daily limit for everyone, so they may pause until the next day. Creating extra accounts to get more is not allowed.`,
      ],
    },
    {
      heading: "Demo payments",
      paragraphs: [
        `The ${site.priceLabel} plan is a demo of Stripe Checkout in test mode. Only Stripe's test card works: 4242 4242 4242 4242, with any future expiry date and any 3-digit CVC. No real money moves. Nothing is charged, refunded or renewed for real. Never enter a real card number.`,
        `The demo plan includes ${usage.credits.monthly} credits a month, and up to ${usage.credits.daily} of them can be used in one day. Credits are used by the word: 1 credit is ${usage.credits.wordsPerCredit} words of draft or notes, and each rewrite counts at least ${usage.credits.minWords} words. Drafts can be up to ${site.draftMaxWords.toLocaleString("en-GB")} words. A rewrite that fails, or that the AI refuses, uses no credits.`,
      ],
    },
    {
      heading: "Assessed work",
      paragraphs: ["Do not use Polisher for coursework, exams, dissertations or any other assessed work you must do yourself, or anywhere you are required to say that you used AI and have not."],
    },
    {
      heading: "Fair use",
      paragraphs: ["Do not use Polisher for anything unlawful, to harass or deceive people, to break someone else's rights, or to overload or copy the service."],
    },
    {
      heading: "Your writing",
      paragraphs: ["You own your samples, drafts and rewrites. You let us process them only to run the demo for you. Please don't paste anything private or sensitive."],
    },
    {
      heading: "Liability",
      paragraphs: [
        "Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else the law does not allow us to limit.",
        "Otherwise, because the demo is free and sells nothing, we are not liable for losses from using it.",
      ],
    },
    {
      heading: "Law",
      paragraphs: ["These terms are governed by Scots law."],
    },
  ],
};

export const refunds: LegalDoc = {
  slug: "refunds",
  title: "Refunds",
  summary: "There is nothing to refund, because nothing is charged.",
  updated: "29 October 2026",
  sections: [
    {
      heading: "No real payments",
      paragraphs: [
        "Polisher is a demo. The checkout runs in Stripe's test mode, where only Stripe's test card works. No real money moves, so nothing is charged and there is nothing to refund.",
      ],
    },
    {
      heading: "Test refunds",
      paragraphs: ["Test refunds can be shown in the Stripe sandbox only. They are not real."],
    },
    {
      heading: "Questions",
      paragraphs: [`Email ${site.owner.email}.`],
    },
  ],
};

export const legalDocs = [privacy, terms, refunds] as const;
