import { Suspense } from 'react'
import { TmaHomePage } from '@/components/tma/HomePage'
import { Skeleton } from '@/components/ui/skeleton'

export default function TmaPage() {
  return (
    <Suspense fallback={<HomePageSkeleton />}>
      <TmaHomePage />
    </Suspense>
  )
}

function HomePageSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  )
}
