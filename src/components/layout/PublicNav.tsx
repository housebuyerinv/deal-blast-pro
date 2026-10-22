import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

export default function PublicNav() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const buyerMatchPage = useLocation().pathname.startsWith('/buyermatch')
  const signup = buyerMatchPage ? '/register?product=buyermatch&tier=starter' : '/register'
  const signin = buyerMatchPage ? '/admin-login?product=buyermatch&tier=starter' : '/admin-login'
  const signupLabel = buyerMatchPage ? 'Get BuyerMatch' : 'Sign Up Free'

  const menuItems = [
    { to: '/buyermatch', label: 'BuyerMatch' },
    { to: '/pricing', label: 'Pricing' },
    { to: '/features', label: 'Features' },
    { to: signup, label: signupLabel },
    { to: signin, label: 'Login' },
    { to: '/contact', label: 'Contact' },
    { to: '/portal', label: 'Submit Deal' },
    { to: '/buyer-portal', label: 'Buyer Portal' },
  ]

  return (
    <nav className="border-b border-[#252A38] bg-[#0A0C12]/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-3">
        <Link to="/" onClick={close} className="flex items-center gap-2 min-w-0 shrink">
          <div className="w-8 h-8 md:w-9 md:h-9 bg-[#22C55E] rounded flex items-center justify-center text-black font-black text-xl md:text-2xl shrink-0">D</div>
          <div className="font-semibold text-base sm:text-lg md:text-xl tracking-[-0.5px] md:tracking-[-1px] whitespace-nowrap leading-none">DEAL BLAST PRO</div>
        </Link>

        <div className="hidden xl:flex items-center gap-4 text-sm">
          <Link to="/buyermatch" className="font-semibold text-[#22C55E] hover:text-white">BuyerMatch</Link>
          <Link to="/pricing" className="hover:text-white">Pricing</Link>
          <Link to="/features" className="hover:text-white">Features</Link>
          <Link to="/portal" className="hover:text-white">Submit Deal</Link>
          <Link to="/buyer-portal" className="hover:text-white">Buyer Portal</Link>
          <Link to="/contact" className="hover:text-white">Contact</Link>
          <Link to={signin} className="px-3 py-1.5 hover:text-white">Sign In</Link>
          <Link to={signup} className="btn btn-primary px-5 py-1.5 text-sm">{signupLabel}</Link>
        </div>

        <div className="xl:hidden flex items-center gap-2 shrink-0">
          <Link to={signup} onClick={close} className="btn btn-green px-3 py-1.5 text-xs whitespace-nowrap">{signupLabel}</Link>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="btn btn-ghost p-2"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="xl:hidden border-t border-[#252A38] bg-[#0A0C12] shadow-xl">
          <div className="px-4 py-3 grid gap-2">
            <Link to={signup} onClick={close} className="btn btn-green w-full py-2.5 text-sm">{signupLabel}</Link>
            <div className="grid gap-1 pt-2">
              {menuItems.map(item => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={close}
                  className="rounded border border-[#252A38] px-4 py-3 text-sm text-[#C5CAD6] hover:text-white hover:bg-[#171B26]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
