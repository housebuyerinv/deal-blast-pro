import { useEffect } from 'react'
import { CheckCircle2, Sparkles, Wrench } from 'lucide-react'
import {
  latestReleaseId,
  RELEASE_NOTES_VIEWED_KEY,
  sortedReleaseNotes,
  type ReleaseNoteSection,
} from '../../content/releaseNotes'

const sectionStyles: Record<ReleaseNoteSection['label'], { icon: typeof Sparkles; className: string }> = {
  New: { icon: Sparkles, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' },
  Improved: { icon: CheckCircle2, className: 'border-sky-500/30 bg-sky-500/10 text-sky-200' },
  Fixed: { icon: Wrench, className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' },
}

function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export default function WhatsNew() {
  useEffect(() => {
    if (!latestReleaseId) return
    try {
      window.localStorage.setItem(RELEASE_NOTES_VIEWED_KEY, latestReleaseId)
      window.dispatchEvent(new CustomEvent('dealblastpro:release-notes-viewed', { detail: latestReleaseId }))
    } catch {
      // The page remains fully usable when browser storage is unavailable.
    }
  }, [])

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[2px] text-emerald-300">
          <Sparkles size={15} aria-hidden="true" /> What&apos;s New
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Release Notes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8B92A3]">
          A quick look at the newest Deal Blast Pro improvements, written for the people using them every day.
        </p>
      </header>

      <div className="space-y-5">
        {sortedReleaseNotes.map((release, index) => (
          <article key={release.id} className="card overflow-hidden border border-[#252A38] bg-[#0F111A]">
            <div className="border-b border-[#252A38] p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-white sm:text-xl">{release.title}</h2>
                    {index === 0 ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">Latest</span> : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[#C5CAD6]">{release.summary}</p>
                </div>
                <div className="shrink-0 text-xs text-[#8B92A3] sm:text-right">
                  <div className="font-medium text-[#C5CAD6]">{release.version}</div>
                  <time dateTime={release.date}>{formatReleaseDate(release.date)}</time>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-3">
              {release.sections.map(section => {
                const style = sectionStyles[section.label]
                const Icon = style.icon
                return (
                  <section key={section.label} className="rounded-lg border border-[#252A38] bg-[#0A0C12] p-4" aria-labelledby={`${release.id}-${section.label}`}>
                    <div id={`${release.id}-${section.label}`} className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${style.className}`}>
                      <Icon size={13} aria-hidden="true" /> {section.label}
                    </div>
                    <ul className="space-y-2 text-sm leading-5 text-[#C5CAD6]">
                      {section.items.map(item => <li key={item} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#6B7280]" aria-hidden="true" /><span>{item}</span></li>)}
                    </ul>
                  </section>
                )
              })}
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
