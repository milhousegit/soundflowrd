import { Skeleton } from '@/components/ui/skeleton';

const ArtistCardSkeleton = () => {
  return (
    <div className="p-3 md:p-4 rounded-xl bg-card">
      <Skeleton className="aspect-square rounded-full mb-3 md:mb-4" />
      <Skeleton className="h-4 w-2/3 mx-auto mb-2" />
      <Skeleton className="h-3 w-1/3 mx-auto" />
    </div>
  );
};

export default ArtistCardSkeleton;
