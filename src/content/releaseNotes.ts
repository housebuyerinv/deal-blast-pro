export type ReleaseNoteSection = {
  label: 'New' | 'Improved' | 'Fixed'
  items: string[]
}

export type ReleaseNote = {
  id: string
  version: string
  date: string
  title: string
  summary: string
  sections: ReleaseNoteSection[]
}

export const releaseNotes: ReleaseNote[] = [
  {
    id: '2026-08-23-features-showcase',
    version: 'August 2026',
    date: '2026-08-23',
    title: 'New Deal Blast Pro Features Showcase',
    summary: 'A better way to see everything DBP can do before you upgrade.',
    sections: [
      {
        label: 'New',
        items: [
          'Added a full public Features page showing the Deal Blast Pro workflow from deal submission through closing.',
          'Added visual product tours for deal review, buyer management, buyer matching, targeted blasts, calculators, resources, pipeline, and follow-up.',
          'Added a dedicated Property Intelligence section explaining what Intelligence Credits are and how they work.',
          'Added clear explanations for cached lookups, included credits, purchased credits, and trial credit behavior.',
        ],
      },
      {
        label: 'Improved',
        items: [
          'Added Features links throughout the public navigation and homepage.',
          'Improved product screenshots and mobile presentation so visitors can better understand the platform before signing up.',
          'Pricing and Intelligence Credit information now use shared product configuration to help keep public information aligned with the application.',
        ],
      },
    ],
  },
  {
    id: '2026-08-15-property-intelligence',
    version: 'August 2026',
    date: '2026-08-15',
    title: 'Smarter Property Intelligence workflows',
    summary: 'Property research is easier to revisit, save, and troubleshoot.',
    sections: [
      {
        label: 'New',
        items: [
          'Recent property searches now persist across sessions.',
          'Property searches can be saved and reopened later.',
        ],
      },
      {
        label: 'Improved',
        items: [
          'Re-running a property search now follows the standard Property Intelligence workflow.',
          'Eligible cached lookups are handled more efficiently without consuming an additional credit.',
          'Property Intelligence reliability and session handling are improved.',
          'Owner Admin diagnostics now provide clearer Property Intelligence activity insights.',
          'Runtime compatibility and stability are improved.',
        ],
      },
      {
        label: 'Fixed',
        items: [
          'Internal operation tracking now gives support better information when troubleshooting Property Intelligence activity.',
        ],
      },
    ],
  },
]

export const sortedReleaseNotes = [...releaseNotes].sort(
  (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
)

export const latestReleaseId = sortedReleaseNotes[0]?.id || ''
export const RELEASE_NOTES_VIEWED_KEY = 'dealblastpro:release-notes:last-viewed'
