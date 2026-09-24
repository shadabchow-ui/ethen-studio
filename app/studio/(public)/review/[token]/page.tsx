import type { Metadata } from "next";
import { StudioReviewGallery } from "@/components/studio/StudioReviewGallery";

export const metadata: Metadata = {
  title: "Shared Review",
  description: "Token-gated read-only review of shared Studio assets.",
  alternates: {
    canonical: "/studio/review",
  },
};

export default async function StudioReviewRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <StudioReviewGallery token={token} />
  );
}
