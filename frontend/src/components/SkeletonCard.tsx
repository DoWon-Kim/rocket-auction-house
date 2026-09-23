export default function SkeletonCard() {
  return (
    <article className="bg-surface border border-line rounded-2xl overflow-hidden">
      {/* Image placeholder */}
      <div className="aspect-[3/4] bg-sunken animate-pulse" />
      {/* Info area */}
      <div className="p-3 space-y-2">
        <div className="h-2 w-16 rounded bg-line animate-pulse" />
        <div className="h-3 w-4/5 rounded bg-[#161522] animate-pulse" />
        <div className="h-2.5 w-3/5 rounded bg-[#13121e] animate-pulse" />
        <div className="pt-1 flex items-end justify-between">
          <div className="h-4 w-20 rounded bg-[#161522] animate-pulse" />
          <div className="h-3 w-10 rounded bg-[#11101b] animate-pulse" />
        </div>
        <div className="flex items-center justify-between pt-0.5">
          <div className="h-2.5 w-16 rounded bg-[#11101b] animate-pulse" />
          <div className="h-2.5 w-8 rounded bg-[#11101b] animate-pulse" />
        </div>
      </div>
    </article>
  )
}
