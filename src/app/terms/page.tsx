import type { Metadata } from "next";
import { terms } from "@/content/legal";
import { LegalPage } from "../components/legal-page";

export const metadata: Metadata = { title: terms.title, description: terms.summary, alternates: { canonical: "/terms" } };

export default function Page() {
  return <LegalPage doc={terms} />;
}
