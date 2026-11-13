import GlassPanel from '@/components/glass-panel/glass-panel'
import PillGlass from '@/components/glass-pill/pill-glass'
import { engineLabel } from '@/lib/net/engines'
import type { LegalSection } from '@/lib/legal'
import './info-panel.css'

const DISCORD = 'https://discord.gg/R3dJ7hpUXX'

/** The policy documents and the feedback form, opened from here. */
const LINKS: { label: string; open: 'feedback' | LegalSection }[] = [
  { label: 'Feedback', open: 'feedback' },
  { label: 'Terms of Service', open: 'terms' },
  { label: 'Privacy', open: 'privacy' },
]

const TEAM = [
  {
    name: 'Crafted',
    role: 'Co-Owner & Project Creator',
    avatar: '/img/about-images/crafted.png',
    links: [{ label: 'GitHub', href: 'https://github.com/craf1ed' }],
  },
  {
    name: 'Mizzery',
    role: 'Co-Owner & Community Manager',
    avatar: '/img/about-images/mizzery.png',
    links: [
      { label: 'Portfolio', href: 'https://xxmizzeryxx.github.io/mizzery.github.io' },
      { label: 'GitHub', href: 'https://github.com/xXmizzeryXx' },
    ],
  },
]

const TECHNOLOGY = [
  { name: engineLabel('core'), sub: 'Browsing technology' },
  // v1 lists the pair together: "Տсrаⅿјеt V1 and V2".
  { name: `${engineLabel('runtime')} and V2`, sub: 'Browsing technology' },
  { name: engineLabel('rh'), sub: 'Browsing technology' },
  { name: engineLabel('remote'), sub: 'Browsing technology' },
  { name: 'Cloudflare', sub: 'Site hosting & DDoS protection' },
  { name: 'GitHub', sub: 'File hosting' },
]

const THANKS = [
  { name: 'Titanium Network', sub: 'Scramjet V1 and UV source code' },
  { name: 'Our Community', sub: 'Thank you for feedback and support' },
  { name: 'Render', sub: 'Hosting free relay servers' },
]

export default function InfoPanel({
  onClose,
  onOpenFeedback,
  onOpenLegal,
}: {
  onClose: () => void
  onOpenFeedback: () => void
  onOpenLegal: (section: LegalSection) => void
}) {
  return (
    <GlassPanel className="info-panel">
      <div className="info-panel__head">
        <span className="info-panel__title">About &amp; Credits</span>
        <button className="info-panel__close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <p className="info-panel__lede">
        Plutonium Network is a web platform providing access to games, applications, AI services, virtual machines, and
        more, all directly through your browser.
      </p>
      <p className="info-panel__lede">
        This platform is also meant for internet freedom. With the on-going, rising censorship in this world. From
        GoGuardian on a school Chromebook to Europe&rsquo;s Digital Services Act, this site will help you evade that.
      </p>

      <div className="info-panel__section">
        <div className="info-panel__label">Creators &amp; Team</div>
        {TEAM.map((member) => (
          <div className="info-panel__member" key={member.name}>
            <img className="info-panel__avatar" src={member.avatar} alt="" draggable={false} />
            <span className="info-panel__copy">
              <span className="info-panel__name">{member.name}</span>
              <span className="info-panel__sub">{member.role}</span>
            </span>
            <span className="info-panel__links-inline">
              {member.links.map((link) => (
                <a key={link.label} className="info-panel__link" href={link.href} target="_blank" rel="noopener noreferrer">
                  <PillGlass />
                  {link.label}
                </a>
              ))}
            </span>
          </div>
        ))}
      </div>

      <div className="info-panel__section">
        <div className="info-panel__label">Technology</div>
        {TECHNOLOGY.map((item) => (
          <div className="info-panel__row" key={item.name}>
            <span className="info-panel__name">{item.name}</span>
            <span className="info-panel__sub">{item.sub}</span>
          </div>
        ))}
      </div>

      <div className="info-panel__section">
        <div className="info-panel__label">Special Thanks</div>
        {THANKS.map((item) => (
          <div className="info-panel__row" key={item.name}>
            <span className="info-panel__name">{item.name}</span>
            <span className="info-panel__sub">{item.sub}</span>
          </div>
        ))}
      </div>

      <div className="info-panel__section">
        <div className="info-panel__label">License</div>
        <div className="info-panel__legal">
          <span className="info-panel__name">Plutonium License (PL) 1.0.0</span>
          <span className="info-panel__sub">© 2026 Plutonium Network. All rights reserved.</span>
        </div>
      </div>

      <div className="info-panel__footer-links">
        {LINKS.map((link) => (
          <button
            key={link.label}
            type="button"
            className="info-panel__link"
            onClick={() => (link.open === 'feedback' ? onOpenFeedback() : onOpenLegal(link.open))}
          >
            <PillGlass />
            {link.label}
          </button>
        ))}
      </div>

      <a className="info-panel__contact" href={DISCORD} target="_blank" rel="noopener noreferrer">
        Have questions or suggestions? Find us on Discord!
      </a>
    </GlassPanel>
  )
}
