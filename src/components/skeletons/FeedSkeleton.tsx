import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const FeedCardSkeleton: React.FC = () => (
  <div className="bg-card rounded-xl border border-border p-4 space-y-3">
    {/* Header - Avatar + Name + Time */}
    <div className="flex items-start gap-3">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="w-16 h-5 rounded-full" />
    </div>

    {/* Content - Album/Track card */}
    <div className="flex gap-3 p-3 bg-muted/30 rounded-lg">
      <Skeleton className="w-16 h-16 rounded-md flex-shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>

    {/* Actions row */}
    <div className="flex items-center gap-4 pt-2">
      <Skeleton className="h-8 w-16 rounded-md" />
      <Skeleton className="h-8 w-16 rounded-md" />
      <Skeleton className="h-8 w-16 rounded-md" />
    </div>
  </div>
);

const FeedSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <FeedCardSkeleton key={index} />
      ))}
    </div>
  );
};

export default FeedSkeleton;
