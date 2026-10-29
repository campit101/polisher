// Words for the app itself (/app) and the usage bars. Checked by tests/unit/site-copy.test.ts.
import { site } from "@/config/site";
import { chargedWords, creditsOf, usage } from "@/config/usage";

/** Credits with up to two decimals and no trailing zeros: 0.5, 1.23, 4. */
const credits = (n: number) => Number(n.toFixed(2)).toLocaleString("en-GB");
const creditWord = (n: number) => `${credits(n)} ${n === 1 ? "credit" : "credits"}`;
const ukDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" });
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

export const appCopy = {
  title: "Write",
  // One name for the page whichever tool is in use (Cam, 16 Oct; was "Polish a draft").
  heading: "Write",
  samples: {
    dialogTitle: "Write in your own voice",
    comeBack: "You can come back any time from Settings or your Account page to add or edit your samples.",
    edit: (count: number) => `Edit samples (${count})`,
    done: "Done",
    close: "Close",
    heading: "Your writing samples",
    intro: `Add ${site.samples.min} to ${site.samples.max} pieces you wrote yourself, ${site.samples.minTotalWords} words or more in total. Emails, posts and notes all work. Polisher learns your voice from these.`,
    progress: (count: number, words: number) =>
      `${plural(count, "sample", "samples")}, ${plural(words, "word", "words")} in total.`,
    // Enough to rewrite; empty slots are a nudge, never a block (Cam, 16 Oct).
    ready: (emptySlots: number) =>
      emptySlots > 0
        ? `Ready. You have ${plural(emptySlots, "empty sample slot", "empty sample slots")}. Fill them in to get better results.`
        : "Ready. Your voice is learnt from these.",
    needMore: (samples: number, words: number) => {
      const parts: string[] = [];
      if (samples > 0) parts.push(plural(samples, "more sample", "more samples"));
      if (words > 0) parts.push(plural(words, "more word", "more words"));
      return `Add ${parts.join(" and ")} to start.`;
    },
    addLabel: "Paste or type a sample",
    addPlaceholder: "Something you wrote yourself, such as an email to a colleague",
    add: "Save sample",
    adding: "Saving",
    full: `You have ${site.samples.max} samples, the most Polisher keeps. Delete one to add another.`,
    sampleLabel: (n: number) => `Sample ${n}`,
    words: (n: number) => plural(n, "word", "words"),
    save: "Save changes",
    remove: "Delete",
    tooLong: `A sample can be up to ${site.samples.maxWordsEach.toLocaleString("en-GB")} words and ${site.samples.maxCharsEach.toLocaleString("en-GB")} characters.`,
    empty: "Write or paste some text first.",
    failed: "That didn't save. Try again.",
  },
  questions: {
    toggle: "No samples to hand? Answer 5 questions instead",
    intro: "Answer in your own words, the way you'd write to a friend. Each answer is saved as a sample. Skip any you like, but the answers together need enough words to learn from.",
    items: [
      "Tell a friend about something that went wrong this week and how you sorted it.",
      "Describe your job or your studies to someone who has never heard of it.",
      "Write a short message turning down an invitation, kindly.",
      "What would you tell someone visiting your town for the first time?",
      "Explain something you know a lot about to a curious friend.",
    ],
    save: "Save my answers",
    saving: "Saving",
    noRoom: "Your answers would take you past 5 samples. Delete a sample first, or answer fewer questions.",
    empty: "Answer at least one question first.",
  },
  // Try an example and Clear on each tool (Cam, 16 Oct). The examples show AI habits and rough
  // notes on purpose, so the site-copy check skips the "example" key.
  example: {
    try: "Try an example",
    clear: "Clear",
    draft:
      "Hi Sam,\n\nI hope this email finds you well. I wanted to reach out to confirm that we've finalized the plans for Saturday's team lunch — it's at 1pm at the Italian place on Union Street. Moreover, they've kindly agreed to keep a private table for us.\n\nPlease let me know by Thursday if you have any dietary requirements so I can pass them on.\n\nLooking forward to seeing you there!\n\nBest regards,\nCam",
    notes: "cant do sat lunch, working till 3. could we do sunday instead? same place, 1pm fine for me. let me know by thurs",
  },
  modes: {
    legend: "What do you want to do?",
    // Cam's tab names (16 Oct; were "Rewrite an AI draft" and "Start from my own notes").
    draft: "Rewrite AI draft",
    notes: "Create rewrite",
  },
  history: {
    title: "History",
    intro: "Your last 5 rewrites from both tools, newest first. They are kept in this browser only, so they are not on your other devices, and they are cleared when you sign out.",
    empty: "Nothing here yet. Your rewrites appear here as you make them, so a refresh never loses one.",
    pasted: "What you wrote",
    clear: "Clear history",
    open: "Open Write",
  },
  carried: (saved: number) => saved > 0 ? `Your answers from the free try are saved as ${plural(saved, "writing sample", "writing samples")}. Add more of your own writing to make the voice closer.` : "Your answers from the free try could not be saved here, because your samples are full.",
  kinds: {
    legend: "What is it?",
    work: "Work",
    email: "Email",
    text: "Text",
    article: "Article",
    help: {
      work: "Essays, reports, questionnaires and answers for your job or projects. Written carefully: full sentences, capital letters, apostrophes and no slang.",
      email: "Emails to anyone, from a manager to a landlord. Your own greeting and sign-off stay exactly as you wrote them, and the rest is written carefully with no slang.",
      text: "Messages to friends and family. Only as casual as your own writing samples are, and slang only if your samples use it.",
      article: "Posts and articles for other people to read, such as a blog or LinkedIn. Written carefully with no slang.",
    },
    suggested: (label: string) => `Suggested: ${label}. Pick another if that's wrong.`,
  },
  notes: {
    heading: "Create in your voice",
    placeholder: "Jot down what you want to say, in your own words. Shorthand is fine.",
    // Cam's wording, 16 Oct.
    hint: "Write down your own short draft and Polisher rewrites it as a complete message in your own words. It keeps your wording and adds only what's needed to polish it up.",
    button: "Create rewrite",
  },
  draft: {
    heading: "Paste an AI draft",
    placeholder: "Paste a draft from ChatGPT, Gemini, Copilot or anything else",
    count: (words: number, max: number = site.draftMaxWords) => `${plural(words, "word", "words")} of ${max.toLocaleString("en-GB")}`,
    // What a subscriber's draft will use, before they press the button: credits by the word (Cam, 16 Oct).
    credits: (words: number) => `Uses ${creditWord(creditsOf(chargedWords(words)))}`,
    freeTooLong: `Free drafts can be up to ${usage.free.draftMaxWords} words. The demo plan allows drafts of up to ${site.draftMaxWords.toLocaleString("en-GB")} words.`,
    tooLong: `Drafts can be up to ${site.draftMaxWords.toLocaleString("en-GB")} words and ${site.draftMaxChars.toLocaleString("en-GB")} characters. Shorten it or split it in two.`,
    button: "Rewrite",
    working: "Rewriting. This usually takes 10 to 30 seconds.",
    needsSamples: "Add more of your own writing first, with Edit samples above.",
    needsMore: (samples: number, words: number) => `${appCopy.samples.needMore(samples, words)} Use Edit samples above.`,
    // What the AI company keeps is in the privacy notice (Cam, 17 Oct: one short line here).
    notStored: "Polisher never saves drafts or rewrites.",
    // The Write page has History, so it says where the last 5 are kept (pre-launch review, 17 Oct).
    notStoredWithHistory: "Polisher's servers never save drafts or rewrites. Your last 5 rewrites stay in History, in this browser only.",
  },
  result: {
    heading: "Your rewrite",
    notesHeading: "Your message",
    notesCheckIntro: "These parts of your notes look different in the message. Make sure the meaning is still right.",
    copy: "Copy",
    copied: "Copied!",
    changesHeading: "What the clean-up changed",
    checkHeading: "Check these",
    checkIntro: "These look different from your draft. Make sure the meaning is still right before you send it.",
    numbers: "Numbers from your draft that changed or are missing:",
    links: "Links or email addresses that changed or are missing:",
    quotesChanged: "Quotations with changed or missing words:",
    quotesPunctuation: "Quotations where only the punctuation changed:",
    added: "Added, but not in your draft:",
    claims: "Claims that changed:",
    certainty: "Words like not, may or will that changed:",
    // Never implies the meaning is proven unchanged: the checks are word lists (pre-launch review, 17 Oct).
    noChecks: "Numbers, links and quotations from your draft all came through. These checks can't catch every change in meaning, so read it through before you send it.",
    free: (used: number, max: number) => `Free rewrite ${used} of ${max} used.`,
  },
  locked: {
    heading: "This rewrite is locked until the demo checkout",
    body: "It's ready. Only the start is shown here. Complete the demo checkout within 24 hours and it unlocks on this page. No real money moves.",
    subscribe: "Try the demo checkout",
    refund: "Demo only. Nothing is charged for real.",
    waiting: "It's still here for up to 24 hours. Finish the demo checkout and it opens in this box.",
    opened: "Unlocked after the demo checkout. It's also in your History.",
    expired: "That locked rewrite has expired. Polisher never saves rewrites, so run the draft again.",
    notSubscribed: "The demo checkout hasn't come through yet. Wait a minute and try again.",
  },
  limits: {
    free: "You've used your free rewrites. Try the demo checkout to keep going.",
    // leftWords: words the credits still allow in that period; neededWords: what this draft is charged.
    daily: (leftWords: number, neededWords: number) =>
      leftWords >= usage.credits.minWords && neededWords > leftWords
        ? `This draft uses ${creditWord(creditsOf(neededWords))} and you have ${creditWord(creditsOf(leftWords))} left today. Shorten it to ${leftWords.toLocaleString("en-GB")} words or fewer, or wait until midnight UK time.`
        : `You've used today's ${usage.credits.daily} credits. They reset at midnight UK time.`,
    monthly: (resetsAt: string | null, leftWords: number, neededWords: number) => {
      const when = resetsAt ? `on ${ukDay(resetsAt)}, your billing date` : "on your billing date";
      return leftWords >= usage.credits.minWords && neededWords > leftWords
        ? `This draft uses ${creditWord(creditsOf(neededWords))} and you have ${creditWord(creditsOf(leftWords))} left this month. Shorten it to ${leftWords.toLocaleString("en-GB")} words or fewer, or wait until they reset ${when}.`
        : `You've used this month's ${usage.credits.monthly} credits. They reset ${when}.`;
    },
    // Only free rewrites share a daily limit; subscribers have their credits (Cam, 16 Oct).
    busy: "Today's shared demo AI budget of £0.10 is used up, so new rewrites start again at midnight UTC. Meanwhile, here are three rewrites Polisher made earlier.",
    examplesTitle: "Ready-made examples",
    examplesNote: "Made-up AI drafts, rewritten by Polisher with Claude Haiku 5.5 on 16 October 2026 in the voice of made-up writing samples.",
    exampleDraft: "AI draft",
    exampleRewrite: "Polisher's rewrite",
  },
  errors: {
    empty: "Paste a draft or your notes first.",
    too_long: `Drafts can be up to ${site.draftMaxWords.toLocaleString("en-GB")} words and ${site.draftMaxChars.toLocaleString("en-GB")} characters.`,
    rate_limited: "That's a lot of rewrites in an hour. Wait a while and try again.",
    refused: "The AI wouldn't rewrite this draft. Nothing was charged. Try rewording it.",
    cut_off: "The rewrite came back unfinished. Nothing was charged. Try again, or split the draft in two.",
    malformed: "The rewrite didn't come back properly. Nothing was charged. Try again.",
    free_too_long: `Free drafts can be up to ${usage.free.draftMaxWords} words. The demo plan allows drafts of up to ${site.draftMaxWords.toLocaleString("en-GB")} words.`,
    wrong_length: "The rewrite came back far shorter or longer than what you pasted, so it was thrown away. Nothing was charged. Try again.",
    ai_unavailable: "The AI service didn't answer. Nothing was charged. Try again in a minute. If the shared daily AI budget of £0.10 is used up, ready-made example rewrites are shown until midnight UTC.",
    general: "Something went wrong. Nothing was charged. Try again in a minute.",
  },
  usage: {
    heading: "Usage",
    close: "Close usage",
    freeLeft: (left: number, max: number) => `${left} of ${max}`,
    freeLeftWord: "free rewrites left",
    // The ring's spoken name (Cam, 16 Oct: usage behind a small ring, not in the way).
    meterPaid: (percent: number) => `Usage: ${percent}% left today`,
    meterFree: (left: number, max: number) => `Usage: ${left} of ${max} free rewrites left`,
    today: "Today",
    month: "This month",
    // Cam's mock-up (16 Oct): the share left large, whole credits small underneath.
    percentLeft: (percent: number) => `${percent}%`,
    leftWord: "left",
    creditsLine: (left: number, limit: number) => `${left}/${limit} credits`,
    todayResets: "Resets at midnight UK time",
    monthResets: (iso: string | null) => (iso ? `Resets on ${ukDay(iso)}` : "Resets on your billing date"),
    freeRewrites: "Free rewrites",
    freeCount: (used: number, max: number) => `${used} of ${max} used`,
    freeNote: `The demo plan has ${usage.credits.monthly} credits a month`,
    // Launch decision 3: the first two free rewrites are shown, the third is made but locked.
    freeLine: (used: number, max: number) =>
      used === 0
        ? "Your first two rewrites are free. The third is made but locked until the demo checkout."
        : used < usage.free.shownRewrites
          ? `Free rewrite ${used} of ${max} used. Your next one is free too.`
          : used < max
            ? `Free rewrite ${used} of ${max} used. The next one is made but locked until the demo checkout.`
            : `All ${max} free rewrites used. Try the demo checkout to keep going.`,
    // Said by the button before the locked one is made (launch decision 3).
    nextLocked: "Your next rewrite will be made but locked until the demo checkout.",
  },
};
