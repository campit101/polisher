import type { Metadata } from "next";
import { privacy } from "@/content/legal";
import { LegalPage } from "../components/legal-page";

export const metadata: Metadata = { title: privacy.title, description: privacy.summary, alternates: { canonical: "/privacy" } };

export default function Page() {
  return <LegalPage doc={privacy} />;
}
