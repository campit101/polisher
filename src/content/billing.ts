// Words for the demo payment: Stripe Checkout's own text boxes (test mode only) and the page after paying.
// Checked by tests/unit/site-copy.test.ts.
import { site } from "@/config/site";
import { usage } from "@/config/usage";

export const billingCopy = {
  checkout: {
    // Shown by Stripe next to the required tick box. Stripe turns [text](link) into a link.
    terms: (origin: string) =>
      `I understand this is a demo. No real money moves. I have read the [terms](${origin}/terms) and the [refund page](${origin}/refunds).`,
    submit: (origin: string) =>
      `Demo only, in Stripe's test mode. Use card 4242 4242 4242 4242, any future expiry date and any 3-digit CVC. Nothing is ever charged for real. How the demo uses data: [privacy notice](${origin}/privacy).`,
  },
  subscribed: {
    title: "Demo checkout complete",
    heading: "Demo checkout complete",
    body: "Thank you for trying the test checkout. No real money moved.",
    guest: "To carry on, press Start a demo account. It needs no email address and no password.",
    signIn: "Start a demo account",
    // On the Write page straight after the test payment.
    notice: "Demo checkout complete. Your credits for the month are ready. No real money moved.",
  },
  // The old confirmation email is not sent in the demo (no emails are ever sent). The shape stays
  // because other code imports it, and the text says what is true.
  confirmation: {
    subject: `Your ${site.name} demo subscription`,
    thanks: `Thanks for trying the ${site.name} demo checkout.`,
    charged: (nextOn: string | null) =>
      nextOn
        ? `Nothing was charged for real. Test renewals (next on ${nextOn}) happen in Stripe's sandbox only.`
        : `Nothing was charged for real.`,
    manage: "The demo account and everything in it are deleted automatically after 24 hours.",
    button: "Start writing",
    detailsHeading: "About this demo",
    // Shown as named links in the HTML version and as full addresses in the plain-text one.
    links: [
      ["Terms", "/terms"],
      ["Refunds", "/refunds"],
      ["Privacy notice", "/privacy"],
    ] as const,
    paragraphs: (siteUrl: string, startedOn: string) => [
      `This is a demo, so no email is ever sent. This text is kept only so the page that uses it still works.`,
      `What happened: a demo of the ${site.priceLabel} plan was started on ${startedOn} using Stripe's test mode. No real money moved.`,
      `What it includes: ${usage.credits.monthly} credits a month, up to ${usage.credits.daily} a day. 1 credit is ${usage.credits.wordsPerCredit} words of draft or notes, and each rewrite counts at least ${usage.credits.minWords} words. A rewrite that fails uses none.`,
      `Refunds: there is nothing to refund, because nothing was charged. Test refunds can be shown in the Stripe sandbox only.`,
      `Your account page is at ${siteUrl}/account. The demo account is deleted automatically after 24 hours.`,
      `${site.name} is a demo run by ${site.owner.name}, ${site.owner.town}. Email: ${site.owner.email}.`,
    ],
  },
  failed: "We couldn't open Stripe just now. Try again in a few minutes.",
  pending: "Opening Stripe",
};
