import { Link } from "react-router-dom";
import {
  ArrowRight,
  FileCheck2,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import PublicNav from "../../components/layout/PublicNav";
import PublicFooter from "../../components/layout/PublicFooter";

export default function BuyerMatchBuyerHelp() {
  return (
    <div className="bm-site">
      <PublicNav />
      <main id="main-content" className="bm-section bm-buyer-guide">
        <p className="bm-eyebrow">BUYERMATCH · BUYER GUIDE</p>
        <h1>Your buying profile, proof and private responses.</h1>
        <p className="bm-lead">
          Buyers do not need a paid BuyerMatch or DBP CRM subscription to submit
          criteria or respond to a valid invitation. Here is what you can do
          now—and what requires secure follow-up.
        </p>
        <p className="mb-6">
          New participants can create their own pending buyer profile after
          normal account confirmation. Existing network profiles require a
          valid, identity-matched invitation to connect; neither a receipt nor
          an email address alone grants access.{" "}
          <Link className="bm-inline-link" to="/buyermatch/buyers/account">
            Open your private buyer account →
          </Link>
        </p>
        <div className="bm-detail-grid">
          <section id="criteria" className="bm-panel">
            <FileCheck2 size={25} />
            <p className="bm-eyebrow">INITIAL SUBMISSION</p>
            <h2>Submit your buying criteria.</h2>
            <p>
              The real buyer intake form records your criteria and optional
              invitation consent for review. A submission receipt confirms
              receipt, not approval, verification or eligibility.
            </p>
            <Link className="btn btn-green" to="/buyermatch/buyers">
              Open buyer intake <ArrowRight size={16} />
            </Link>
          </section>
          <section id="proof" className="bm-panel">
            <LockKeyhole size={25} />
            <p className="bm-eyebrow">PROOF OF FUNDS</p>
            <h2>Keep financial documents private.</h2>
            <p>
              Initial proof attachments require an authorized signed-in upload.
              Guests may submit criteria without proof. A failed or unavailable
              upload is not a successful attachment.
            </p>
            <p>
              Linked buyers can upload a private replacement in their buyer
              account. Earlier documents are retained; replacements remain
              pending review and do not automatically verify funds. Do not put
              financial records or private links in a support message.
            </p>
            <Link className="btn btn-ghost" to="/buyermatch/buyers/account">
              Open private buyer account
            </Link>
          </section>
          <section id="updates" className="bm-panel">
            <ShieldCheck size={25} />
            <p className="bm-eyebrow">AFTER SUBMISSION</p>
            <h2>Need to change your criteria?</h2>
            <p>
              Sign in normally and connect your profile using a valid, delivered
              invitation for your confirmed email. Neither an email address nor
              a submission receipt alone grants access to an existing profile.
            </p>
            <p>
              Update criteria in your buyer account. Changes require review and
              do not reactivate previous opt-outs. You can withdraw invitation
              consent without accepting a new agreement or buying a
              subscription.
            </p>
            <Link className="btn btn-ghost" to="/buyermatch/buyers/account">
              Manage buying criteria
            </Link>
          </section>
          <section id="responses" className="bm-panel">
            <MessageSquare size={25} />
            <p className="bm-eyebrow">PRIVATE INVITATIONS</p>
            <h2>Track the conversation for one deal.</h2>
            <p>
              Open the complete private link in your invitation. The real
              response page supports interest, offers, passes, messages and
              opt-out, and can load that invitation’s deal conversation when the
              service is available.
            </p>
            <p>
              Your linked buyer account lists your delivered invitations,
              responses, offers and private conversations, including older
              pages. Expired links stay expired. There is no public deal
              inventory. Enter an invitation token only in the private
              account-linking form, never in support or the synthetic demo.
            </p>
            <Link className="btn btn-ghost" to="/buyermatch/demo/buyers">
              See the synthetic buyer walkthrough <ArrowRight size={16} />
            </Link>
          </section>
        </div>
        <div className="bm-comparison-note">
          <ShieldCheck size={24} />
          <div>
            <h2>Demonstration is not activation.</h2>
            <p>
              The interactive demo uses sample data in memory. It does not
              submit criteria, upload proof, change a real buyer profile, send
              responses, or verify eligibility. Hosted intake and
              private-response availability remain subject to the server’s
              release and safety controls.
            </p>
            <Link to="/buyermatch/how-it-works">
              How BuyerMatch works <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
