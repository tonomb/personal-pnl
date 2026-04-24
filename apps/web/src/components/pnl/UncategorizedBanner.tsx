import { TriangleAlertIcon } from "lucide-react";

type Props = { count: number };

export function UncategorizedBanner({ count }: Props) {
  if (count === 0) return null;

  const label = count === 1 ? "1 uncategorized transaction" : `${count} uncategorized transactions`;

  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
    >
      <TriangleAlertIcon className="size-4 shrink-0" />
      <span>
        {label} will not appear in this report.{" "}
        <a href="/categorize" className="font-medium underline underline-offset-2 hover:no-underline">
          Categorize now
        </a>
      </span>
    </div>
  );
}
