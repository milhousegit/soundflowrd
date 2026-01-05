import { Skeleton } from '@/components/ui/skeleton';

const TrackCardSkeleton = () => {
  return (
    <div className="flex items-center gap-3 md:gap-4 p-2 md:p-3 rounded-lg">
      <Skeleton className="w-6 md:w-8 h-6 md:h-8 rounded" />
      <Skeleton className="w-10 h-10 rounded" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="w-10 h-4" />
    </div>
  );
};

export default TrackCardSkeleton;
