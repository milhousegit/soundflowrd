import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { usePlayer } from "@/contexts/PlayerContext";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  
  // Check if player is expanded (mobile) to hide toasts
  let isExpanded = false;
  let hasTrack = false;
  try {
    const player = usePlayer();
    isExpanded = player.isExpanded;
    hasTrack = !!player.currentTrack;
  } catch {
    // PlayerContext not available
  }

  if (isExpanded) return null;

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      style={{
        bottom: hasTrack ? 'calc(3.5rem + 56px + env(safe-area-inset-bottom, 0px))' : 'calc(56px + env(safe-area-inset-bottom, 0px))',
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background/90 group-[.toaster]:backdrop-blur-sm group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-md group-[.toaster]:!py-2 group-[.toaster]:!px-4 group-[.toaster]:!min-h-0 group-[.toaster]:!rounded-full md:group-[.toaster]:!rounded-md md:group-[.toaster]:!py-4 md:group-[.toaster]:!px-6",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:!text-xs group-[.toast]:!mt-0 group-[.toast]:!hidden md:group-[.toast]:!block",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          title: "group-[.toast]:!text-xs group-[.toast]:!font-medium md:group-[.toast]:!text-sm",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
