import { createFileRoute } from "@tanstack/react-router";

import { TagsIndexPage } from "@/components/tags/TagsIndexPage";

export const Route = createFileRoute("/tags/")({
  component: TagsIndexPage
});
