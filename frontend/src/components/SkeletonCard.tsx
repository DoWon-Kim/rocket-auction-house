export default function SkeletonCard() {
  return (
    <article className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
      {/* Image placeholder */}
      <div className="aspect-[3/4] bg-[#120e0a] animate-pulse" />
      {/* Info area */}
      <div className="p-3 space-y-2">
        <div className="h-2 w-16 rounded bg-[#2e2318] animate-pulse" />
        <div className="h-3 w-4/5 rounded bg-[#2a2010] animate-pulse" />
        <div className="h-2.5 w-3/5 rounded bg-[#221a10] animate-pulse" />
        <div className="pt-1 flex items-end justify-between">
          <div className="h-4 w-20 rounded bg-[#2a2010] animate-pulse" />
          <div className="h-3 w-10 rounded bg-[#1e1a10] animate-pulse" />
        </div>
        <div className="flex items-center justify-between pt-0.5">
          <div className="h-2.5 w-16 rounded bg-[#1e1a10] animate-pulse" />
          <div className="h-2.5 w-8 rounded bg-[#1e1a10] animate-pulse" />
        </div>
      </div>
    </article>
  )
}
