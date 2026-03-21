import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { usePlayer } from "@/contexts/PlayerContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useServiceStatus } from "@/contexts/ServiceStatusContext";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();
  const { isServiceDown } = useServiceStatus();

  let hasTrack = false;
  try {
    const player = usePlayer();
    hasTrack = !!player.currentTrack;
  } catch {
    // PlayerContext not available
  }

  const bannerOffset = isServiceDown ? 36 : 0;

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={isMobile ? "bottom-center" : "top-center"}
      style={isMobile ? {
        bottom: `calc(${hasTrack ? '3.5rem + ' : ''}56px + ${bannerOffset}px + env(safe-area-inset-bottom, 0px))`,
        zIndex: 49,
      } : {
        top: 'max(env(safe-area-inset-top, 0px), 16px)',
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background/90 group-[.toaster]:backdrop-blur-sm group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-md " +
            (isMobile ? "group-[.toaster]:!py-2 group-[.toaster]:!px-4 group-[.toaster]:!min-h-0 group-[.toaster]:!rounded-full" : "group-[.toaster]:shadow-lg"),
          description: isMobile ? "group-[.toast]:text-muted-foreground group-[.toast]:!text-xs group-[.toast]:!mt-0 group-[.toast]:!hidden" : "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          title: isMobile ? "group-[.toast]:!text-xs group-[.toast]:!font-medium" : undefined,
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
