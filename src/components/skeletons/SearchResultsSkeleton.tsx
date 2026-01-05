import { Skeleton } from '@/components/ui/skeleton';
import ArtistCardSkeleton from './ArtistCardSkeleton';
import AlbumCardSkeleton from './AlbumCardSkeleton';
import TrackCardSkeleton from './TrackCardSkeleton';

const SearchResultsSkeleton = () => {
  return (
    <div className="space-y-8 md:space-y-10 animate-fade-in">
      {/* Artists */}
      <section>
        <Skeleton className="h-6 w-24 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <ArtistCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Albums */}
      <section>
        <Skeleton className="h-6 w-20 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <AlbumCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Tracks */}
      <section>
        <Skeleton className="h-6 w-16 mb-4" />
        <div className="space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <TrackCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default SearchResultsSkeleton;
