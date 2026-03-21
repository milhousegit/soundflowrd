import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { usePlayer } from "@/contexts/PlayerContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useServiceStatus } from "@/contexts/ServiceStatusContext";

export function Toaster() {
  const { toasts } = useToast();
  const isMobile = useIsMobile();
  const { isServiceDown } = useServiceStatus();

  let hasTrack = false;
  try {
    const player = usePlayer();
    hasTrack = !!player.currentTrack;
  } catch {
    // PlayerContext not available
  }

  const bannerOffset = isServiceDown ? 36 : 0; // ~py-2.5 + text height

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props} className={isMobile ? "!py-2 !px-4 !min-h-0 !rounded-full !shadow-md !pr-8" : undefined}>
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
          isMobile
            ? "!fixed !top-auto !left-1/2 !-translate-x-1/2 !right-auto !flex-col !items-center !w-auto !max-w-[90vw] !p-2"
            : undefined
        }
        style={isMobile ? {
          bottom: `calc(${hasTrack ? '3.5rem + ' : ''}56px + ${bannerOffset}px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 49,
        } : undefined}
      />
    </ToastProvider>
  );
}
