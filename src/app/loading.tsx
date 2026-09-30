export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-40 animate-pulse rounded-lg bg-surface" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl border border-line bg-surface" />
      ))}
    </div>
  );
}
