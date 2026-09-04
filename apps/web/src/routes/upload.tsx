import { createFileRoute } from "@tanstack/react-router";

import { UploadPage } from "@/components/upload/UploadPage";

export const Route = createFileRoute("/upload")({
  component: UploadPage
});
