import { Link } from 'react-router-dom'
import PublicFooter from '../../components/layout/PublicFooter'

export default function Security() {
  return (
    <div className="min-h-screen bg-[#0A0C12] text-[#E6E8EE]">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="text-sm text-[#3B82F6]">Back to home</Link>
        <h1 className="text-4xl font-semibold mt-6 mb-3">Security</h1>
        <p className="text-[#8B92A3] mb-8">
          Deal Blast Pro uses administrative, technical, and organizational safeguards designed to protect account and submission information. No system can guarantee absolute security, and users should avoid submitting unnecessary sensitive information.
        </p>

        <section className="space-y-6 text-sm leading-6 text-[#C5CAD6]">
          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Authentication And Access Controls</h2>
            <p>
              Authenticated app areas require sign-in. Protected workflows verify active account status before app content is rendered, and workspace actions are designed to rely on server-side authorization rather than browser-supplied identity.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Tenant Isolation And Data Access</h2>
            <p>
              Workspace-scoped records are handled with tenant isolation in mind. Users should access only their own workspace, submissions, buyers, deals, and files.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">API Credentials And Providers</h2>
            <p>
              Provider credentials are intended to be handled by server-side routes and environment configuration rather than exposed in public client code. Third-party provider data should be reviewed before use in business decisions.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Database And File Controls</h2>
            <p>
              Database policies, signed file access, and server-side checks are used where applicable to reduce unauthorized access to workspace data and uploaded documents.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Monitoring And Response</h2>
            <p>
              Application and provider logs may be reviewed to investigate errors, suspicious activity, failed requests, or support issues.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">User Responsibilities</h2>
            <p>
              Users should keep credentials private, use accurate account information, avoid uploading unnecessary sensitive data, and report suspected unauthorized access promptly.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#E6E8EE] mb-2">Responsible Reporting</h2>
            <p>
              Security concerns can be reported through the <Link to="/contact" className="text-[#3B82F6]">Contact</Link> page. Please include enough detail to help identify the issue without sharing unnecessary private information.
            </p>
          </div>
        </section>

        <p className="mt-8 text-xs text-[#8B92A3]">Last updated: July 15, 2026</p>
      </main>

      <PublicFooter />
    </div>
  )
}
