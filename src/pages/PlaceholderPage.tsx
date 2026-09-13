type PlaceholderPageProps = {
  title: string
  note: string
}

export function PlaceholderPage({ title, note }: PlaceholderPageProps) {
  return (
    <section className="rounded-2xl border border-line bg-snow p-8">
      <p className="font-mono text-[11px] tracking-[0.22em] text-brass">尚未开放</p>
      <h2 className="mt-3 font-display text-4xl leading-none">{title}</h2>
      <p className="mt-4 max-w-md text-sm leading-7 text-mute">{note}</p>
    </section>
  )
}
