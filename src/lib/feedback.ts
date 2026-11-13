/**
 * The feedback catalog, carried over from v1's js/feedback.js.
 *
 * The ids, select options and required fields are re-checked by the bot, so the
 * two lists have to stay in step: a drift shows up as a 422 on submit rather
 * than as a silently wrong report. `GET /feedback/types` on the bot returns the
 * same catalog for diffing.
 */

export const ENDPOINT = 'https://stelena.plutoniumnet.work/feedback'

export const AREAS = [
  'browsing engine',
  'games',
  'media / streaming',
  'AI (Stelena)',
  'virtual machines',
  'accounts',
  'home screen',
  'other',
]

export type FeedbackField = {
  id: string
  label: string
  kind: 'text' | 'textarea' | 'select' | 'checkbox' | 'url'
  required?: boolean
  max?: number
  placeholder?: string
  options?: string[]
}

export type FeedbackType = {
  id: string
  label: string
  icon: 'bug' | 'feature' | 'account' | 'abuse' | 'dmca' | 'other'
  blurb: string
  legal?: string
  fields: FeedbackField[]
}

export const TYPES: FeedbackType[] = [
  {
    // Slowness is folded in here on purpose: a performance complaint needs the
    // same description, area and severity a bug does, and a separate tile only
    // made people guess which one to pick.
    id: 'bug',
    label: 'Report a bug',
    icon: 'bug',
    blurb: 'Something is broken, slow, crashes, or behaves unexpectedly.',
    fields: [
      {
        id: 'kind',
        label: 'What is happening',
        kind: 'select',
        required: true,
        options: ['it is broken or wrong', 'it is slow or laggy', 'it crashes', 'it looks wrong', 'other'],
      },
      {
        id: 'severity',
        label: 'Severity',
        kind: 'select',
        required: true,
        options: ['cosmetic', 'minor', 'major', 'critical', 'breaks my account'],
      },
      { id: 'area', label: 'Area', kind: 'select', options: AREAS },
      { id: 'reproducible', label: 'Happens every time', kind: 'select', options: ['yes', 'no', 'only sometimes'] },
      { id: 'steps', label: 'Steps to reproduce', kind: 'textarea', max: 2500, placeholder: '1. Open…  2. Click…  3. See…' },
      { id: 'expected', label: 'Expected behaviour', kind: 'text', max: 600 },
      { id: 'actual', label: 'Actual behaviour', kind: 'text', max: 600 },
      {
        id: 'symptom',
        label: 'If it is slow, what is slow',
        kind: 'select',
        options: ['page load', 'input lag', 'frame rate', 'video playback', 'downloads', 'startup', 'other'],
      },
      { id: 'measurements', label: 'Timings, if you have them', kind: 'text', max: 500, placeholder: 'e.g. 12s to first paint on a 100 Mbps line' },
      { id: 'startedWhen', label: 'Started happening', kind: 'select', options: ['today', 'this week', 'this month', 'after an update', 'always'] },
      { id: 'region', label: 'Your region', kind: 'text', max: 120 },
      { id: 'evidence', label: 'Screenshot or link', kind: 'url', max: 500, placeholder: 'https://…' },
    ],
  },
  {
    id: 'feature',
    label: 'Request a feature',
    icon: 'feature',
    blurb: 'An idea, integration, or improvement you would like to see.',
    fields: [
      { id: 'problem', label: 'What problem would it solve', kind: 'textarea', required: true, max: 2000 },
      { id: 'area', label: 'Area', kind: 'select', options: AREAS.slice(0, -1).concat(['site-wide', 'other']) },
      { id: 'priority', label: 'How much would this help', kind: 'select', options: ['nice to have', 'would use it weekly', 'would use it daily', 'blocking me'] },
      { id: 'alternatives', label: 'Alternatives you tried', kind: 'text', max: 600 },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    icon: 'account',
    blurb: 'Sign-in, profile changes, deletion, or billing.',
    fields: [
      {
        id: 'issue',
        label: 'What do you need',
        kind: 'select',
        required: true,
        options: [
          "can't sign in",
          'sign-in link / reset broken',
          'change or unlink a sign-in method',
          'profile data wrong',
          'export my data',
          'delete my account',
          'billing or donation',
          'other',
        ],
      },
      { id: 'accountEmail', label: 'Account email', kind: 'text', required: true, max: 254 },
      { id: 'since', label: 'When did it start', kind: 'text', max: 120 },
    ],
  },
  {
    id: 'abuse',
    label: 'Report abuse or content',
    icon: 'abuse',
    blurb: 'Harassment, malicious content, phishing, or illegal material.',
    fields: [
      {
        id: 'abuseType',
        label: 'Type of abuse',
        kind: 'select',
        required: true,
        options: [
          'harassment or threats',
          'hate or extremism',
          'sexual content involving minors',
          'non-consensual intimate imagery',
          'malware, phishing or scams',
          'spam or ban evasion',
          'copyright or impersonation',
          'other',
        ],
      },
      { id: 'location', label: 'Where it is', kind: 'text', required: true, max: 500, placeholder: 'URL, game id, profile, or Discord message link' },
      { id: 'evidence', label: 'Evidence link', kind: 'url', max: 500 },
      { id: 'urgent', label: 'There is an immediate risk to a person', kind: 'checkbox' },
      {
        id: 'relationship',
        label: 'Your relationship to it',
        kind: 'select',
        options: ['I am the target', 'I am a bystander', 'I am a parent or guardian', 'staff or moderator', 'other'],
      },
    ],
  },
  {
    id: 'dmca',
    label: 'Copyright / DMCA',
    icon: 'dmca',
    blurb: 'Takedown notice or counter-notice under the DMCA.',
    legal:
      'A takedown notice is a legal declaration. Every field below is required and the notice has to include all of it to be actionable, so please fill it in exactly.',
    fields: [
      { id: 'noticeKind', label: 'This is a', kind: 'select', required: true, options: ['takedown notice', 'counter-notice'] },
      { id: 'legalName', label: 'Full legal name', kind: 'text', required: true, max: 160 },
      { id: 'organisation', label: 'Organisation (if any)', kind: 'text', max: 160 },
      { id: 'postalAddress', label: 'Postal address', kind: 'textarea', required: true, max: 600 },
      { id: 'phone', label: 'Telephone', kind: 'text', required: true, max: 40 },
      { id: 'workTitle', label: 'Copyrighted work', kind: 'text', required: true, max: 300, placeholder: 'Title, author, registration number if you have one' },
      { id: 'workDescription', label: 'Description of the work', kind: 'textarea', required: true, max: 1500 },
      { id: 'infringingUrls', label: 'Infringing material: exact URLs', kind: 'textarea', required: true, max: 2500, placeholder: 'One URL per line' },
      {
        id: 'goodFaith',
        label: 'I have a good-faith belief that the use described is not authorised by the copyright owner, its agent, or the law.',
        kind: 'checkbox',
        required: true,
      },
      {
        id: 'accuracy',
        label:
          'I swear, under penalty of perjury, that the information in this notice is accurate and that I am the owner or am authorised to act on the owner’s behalf.',
        kind: 'checkbox',
        required: true,
      },
      { id: 'signature', label: 'Electronic signature (type your full legal name)', kind: 'text', required: true, max: 160 },
    ],
  },
  {
    id: 'other',
    label: 'Something else',
    icon: 'other',
    blurb: 'Partnerships, press, questions, or general feedback.',
    fields: [
      { id: 'topic', label: 'Topic', kind: 'select', options: ['partnership', 'press or media', 'job or volunteer', 'question', 'compliment', 'complaint', 'other'] },
      { id: 'organisation', label: 'Organisation', kind: 'text', max: 160 },
    ],
  },
]
