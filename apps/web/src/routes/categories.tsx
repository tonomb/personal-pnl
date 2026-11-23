import { createFileRoute } from "@tanstack/react-router";

import { CategoriesPage } from "@/components/categories/CategoriesPage";

export const Route = createFileRoute("/categories")({
  component: CategoriesPage
});
