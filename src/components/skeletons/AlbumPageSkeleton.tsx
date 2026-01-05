import { Skeleton } from '@/components/ui/skeleton';
import TrackCardSkeleton from './TrackCardSkeleton';

const AlbumPageSkeleton = () => {
  return (
    <div className="pb-32 animate-fade-in">
      {/* Header */}
      <div className="p-4 md:p-8 pt-12 md:pt-16 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-8 bg-gradient-to-b from-primary/10 to-transparent">
        <Skeleton className="w-40 h-40 md:w-56 md:h-56 rounded-xl" />
        <div className="flex-1 min-w-0 text-center md:text-left space-y-3">
          <Skeleton className="h-4 w-16 mx-auto md:mx-0" />
          <Skeleton className="h-10 w-64 mx-auto md:mx-0" />
          <Skeleton className="h-4 w-48 mx-auto md:mx-0" />
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 md:px-8 py-4 md:py-6 flex items-center gap-4">
        <Skeleton className="w-14 h-14 rounded-full" />
        <Skeleton className="w-10 h-10 rounded-full" />
        <Skeleton className="w-10 h-10 rounded-full" />
      </div>

      {/* Tracks */}
      <div className="px-4 md:px-8 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <TrackCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
};

export default AlbumPageSkeleton;
