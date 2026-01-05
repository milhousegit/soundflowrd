import { Skeleton } from '@/components/ui/skeleton';
import TrackCardSkeleton from './TrackCardSkeleton';
import AlbumCardSkeleton from './AlbumCardSkeleton';

const ArtistPageSkeleton = () => {
  return (
    <div className="pb-32 animate-fade-in">
      {/* Hero Section */}
      <div className="relative h-72 md:h-80 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-background" />
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6">
          <Skeleton className="w-32 h-32 md:w-48 md:h-48 rounded-full" />
          <div className="flex-1 min-w-0 text-center md:text-left space-y-3">
            <Skeleton className="h-4 w-16 mx-auto md:mx-0" />
            <Skeleton className="h-12 w-64 mx-auto md:mx-0" />
            <div className="flex flex-wrap justify-center md:justify-start gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 md:px-8 py-4 md:py-6 flex items-center gap-3 md:gap-4">
        <Skeleton className="w-14 h-14 rounded-full" />
        <Skeleton className="w-24 h-10 rounded-lg" />
        <Skeleton className="w-10 h-10 rounded-full" />
      </div>

      {/* Popular Tracks */}
      <section className="px-4 md:px-8 mb-8 md:mb-10">
        <Skeleton className="h-7 w-32 mb-4" />
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <TrackCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Discography */}
      <section className="px-4 md:px-8">
        <Skeleton className="h-7 w-40 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <AlbumCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default ArtistPageSkeleton;
