import type { Metadata } from "next";
import { refunds } from "@/content/legal";
import { LegalPage } from "../components/legal-page";

export const metadata: Metadata = { title: refunds.title, description: refunds.summary, alternates: { canonical: "/refunds" } };

export default function Page() {
  return <LegalPage doc={refunds} />;
}
