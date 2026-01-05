import { Skeleton } from '@/components/ui/skeleton';
import AlbumCardSkeleton from './AlbumCardSkeleton';
import ArtistCardSkeleton from './ArtistCardSkeleton';

const HomeSkeleton = () => {
  return (
    <div className="space-y-8 md:space-y-10">
      {/* New Releases */}
      <section>
        <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
          <Skeleton className="w-5 h-5 md:w-6 md:h-6 rounded" />
          <Skeleton className="h-7 w-40" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <AlbumCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Popular Artists */}
      <section>
        <Skeleton className="h-7 w-48 mb-4 md:mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ArtistCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default HomeSkeleton;
