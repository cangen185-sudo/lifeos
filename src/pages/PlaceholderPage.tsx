import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui/EmptyState'
import { Kicker } from '../components/ui/primitives'

type PlaceholderPageProps = {
  kicker: string
  title: string
  lede: string
  note: string
}

export function PlaceholderPage({ kicker, title, lede, note }: PlaceholderPageProps) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="min-w-0">
        <header className="rise">
          <Kicker>{kicker}</Kicker>
          <h1 className="mt-3 font-display text-[3rem] leading-[0.95] tracking-tight sm:text-[3.5rem]">
            {title}
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-7 text-mute">{lede}</p>
        </header>
        <div className="mt-10">
          <EmptyState
            kicker="尚未开放"
            title="这一页等真实数据"
            body={note}
            action={
              <Link
                to="/"
                className="text-[14px] text-copper underline-offset-4 hover:underline"
              >
                回到今日 →
              </Link>
            }
          />
        </div>
      </section>
    </div>
  )
}
