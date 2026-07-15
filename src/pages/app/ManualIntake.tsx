
import DealIntakeWizard from './DealIntakeWizard'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

export default function ManualIntake() {
  const navigate = useNavigate()

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <div className="text-xs text-[#8B92A3]">DEAL INTAKE</div>
          <div className="text-2xl font-semibold">Manual Deal Intake (Internal)</div>
        </div>
        <button onClick={() => navigate('/app/submissions')} className="btn btn-ghost">Back to Submissions Queue</button>
      </div>
      <DealIntakeWizard submissionSource="Internal Intake" onComplete={(_deal) => {
        toast.success('Deal saved')
        navigate('/app/submissions')
      }} />
    </div>
  )
}


