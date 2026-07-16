import { Link } from 'react-router-dom'

const footerLinks = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/portal', label: 'Submit Deal' },
  { to: '/buyer-portal', label: 'Buyer Portal' },
  { to: '/contact', label: 'Contact' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/refund-policy', label: 'Refund Policy' },
  { to: '/acceptable-use', label: 'Acceptable Use Policy' },
  { to: '/security', label: 'Security' },
]

export default function PublicFooter() {
  return (
    <footer className="border-t border-[#252A38] py-8 text-center text-xs text-[#8B92A3]">
      Deal Blast Pro<br />
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 px-4">
        {footerLinks.map(link => (
          <Link key={link.to} to={link.to} className="hover:text-white">
            {link.label}
          </Link>
        ))}
      </div>
    </footer>
  )
}
