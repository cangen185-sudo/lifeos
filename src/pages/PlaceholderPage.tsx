type PlaceholderPageProps = {
  title: string
  note: string
}

export function PlaceholderPage({ title, note }: PlaceholderPageProps) {
  return (
    <section className="rounded-xl border border-dashed border-stone-300 p-6">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-500">{note}</p>
    </section>
  )
}
