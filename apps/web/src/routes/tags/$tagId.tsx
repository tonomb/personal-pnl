import { createFileRoute } from "@tanstack/react-router";

import { TagDetailPage } from "@/components/tags/TagDetailPage";

export const Route = createFileRoute("/tags/$tagId")({
  component: function TagDetailRoute() {
    const { tagId } = Route.useParams();
    return <TagDetailPage tagId={tagId} />;
  }
});
