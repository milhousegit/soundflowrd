import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { usePlayer } from "@/contexts/PlayerContext";
import { useIsMobile } from "@/hooks/use-mobile";

export function Toaster() {
  const { toasts } = useToast();
  const isMobile = useIsMobile();

  let isExpanded = false;
  let hasTrack = false;
  try {
    const player = usePlayer();
    isExpanded = player.isExpanded;
    hasTrack = !!player.currentTrack;
  } catch {
    // PlayerContext not available
  }

  // Hide toasts when player is expanded on mobile
  if (isExpanded && isMobile) return null;

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props} className={isMobile ? "!py-2 !px-4 !min-h-0 !rounded-full !shadow-md" : undefined}>
            <div className={isMobile ? "flex items-center gap-2" : "grid gap-1"}>
              {title && <ToastTitle className={isMobile ? "!text-xs !font-medium whitespace-nowrap" : undefined}>{title}</ToastTitle>}
              {!isMobile && description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {!isMobile && action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport 
        className={
          isMobile && hasTrack
            ? "!fixed !bottom-[calc(3.5rem+56px+env(safe-area-inset-bottom,0px))] !top-auto !left-1/2 !-translate-x-1/2 !right-auto !flex-col !items-center !w-auto !max-w-[90vw]"
            : isMobile
            ? "!fixed !bottom-[calc(56px+env(safe-area-inset-bottom,0px))] !top-auto !left-1/2 !-translate-x-1/2 !right-auto !flex-col !items-center !w-auto !max-w-[90vw]"
            : undefined
        }
      />
    </ToastProvider>
  );
}
