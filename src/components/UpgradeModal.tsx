import { useAppStore } from '../store/useAppStore'
import { X } from 'lucide-react'

export default function UpgradeModal({ isOpen, onClose, feature, limitType }: { 
  isOpen: boolean; 
  onClose: () => void; 
  feature?: string;
  limitType?: string; 
}) {
  const { upgradeToPaid } = useAppStore()

  const title = limitType 
    ? `${limitType} Reached` 
    : 'Unlock Pro Features'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-xl font-semibold">{title}</div>
            {feature && <div className="text-sm text-[#8B92A3] mt-1">You hit the trial limit while trying to use: <span className="text-white">{feature}</span></div>}
          </div>
          <button onClick={onClose}><X /></button>
        </div>

        <div className="text-sm text-[#C5CAD6] mb-4">
          Pro unlocks unlimited everything + the full operating system:
        </div>

        <ul className="text-sm space-y-1 mb-6">
          <li>âœ“ Unlimited buyer CRM & imports</li>
          <li>âœ“ Unlimited deal blasts + Gmail batches</li>
          <li>âœ“ Advanced matching weights & heat scores</li>
          <li>âœ“ Full Pipeline Board + Follow-Up automation</li>
          <li>âœ“ Analytics, Team permissions, Data exports</li>
        </ul>

        <div className="flex gap-2">
          <button onClick={() => { upgradeToPaid(); onClose(); }} className="btn btn-green flex-1">Activate Pro Demo (Free)</button>
          <button onClick={onClose} className="btn btn-ghost flex-1">Maybe Later</button>
        </div>

        <div className="text-[10px] text-center text-[#8B92A3] mt-3">This is a fully functional demo. No payment required.</div>
      </div>
    </div>
  )
}


