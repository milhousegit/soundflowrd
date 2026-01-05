import { Skeleton } from '@/components/ui/skeleton';

const AlbumCardSkeleton = () => {
  return (
    <div className="p-3 md:p-4 rounded-xl bg-card">
      <Skeleton className="aspect-square rounded-lg mb-3 md:mb-4" />
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
};

export default AlbumCardSkeleton;
