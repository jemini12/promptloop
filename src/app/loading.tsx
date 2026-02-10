export default function Loading() {
  return (
    <main className="page-shell">
      <section className="content-shell py-10">
        <div className="surface-card animate-pulse space-y-3">
          <div className="h-6 w-44 rounded bg-zinc-200" />
          <div className="h-4 w-3/4 rounded bg-zinc-100" />
          <div className="h-4 w-1/2 rounded bg-zinc-100" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="surface-card animate-pulse">
            <div className="h-4 w-2/3 rounded bg-zinc-100" />
            <div className="mt-3 h-20 rounded bg-zinc-50" />
          </div>
          <div className="surface-card animate-pulse">
            <div className="h-4 w-1/2 rounded bg-zinc-100" />
            <div className="mt-3 h-20 rounded bg-zinc-50" />
          </div>
        </div>
      </section>
    </main>
  );
}
