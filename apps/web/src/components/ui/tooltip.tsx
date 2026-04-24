import { Tooltip as TooltipBase } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

function Tooltip({ content, children, className }: { content: string; children: React.ReactNode; className?: string }) {
  return (
    <TooltipBase.Root>
      <TooltipBase.Trigger render={<div className={cn("cursor-default", className)} />}>{children}</TooltipBase.Trigger>
      <TooltipBase.Portal>
        <TooltipBase.Positioner sideOffset={8}>
          <TooltipBase.Popup className="z-50 max-w-64 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
            {content}
          </TooltipBase.Popup>
        </TooltipBase.Positioner>
      </TooltipBase.Portal>
    </TooltipBase.Root>
  );
}

export { Tooltip };
