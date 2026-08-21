import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ProductUpdatesPreference() {
  const [enabled,setEnabled]=useState(false);const [loaded,setLoaded]=useState(false);const [saving,setSaving]=useState(false)
  useEffect(()=>{let active=true;void supabase.auth.getUser().then(async(result:any)=>{const data=result.data;if(!data.user)return;const profileResult=await supabase.from('account_profiles').select('product_updates_opt_in').eq('user_id',data.user.id).maybeSingle();if(active){setEnabled(profileResult.data?.product_updates_opt_in===true);setLoaded(true)}});return()=>{active=false}},[])
  const update=async(next:boolean)=>{setSaving(true);const{data}=await supabase.auth.getUser();if(data.user){const{error}=await supabase.from('account_profiles').update({product_updates_opt_in:next,product_updates_preference_updated_at:new Date().toISOString()}).eq('user_id',data.user.id);if(!error)setEnabled(next)}setSaving(false)}
  return <div className="card border border-[#252A38] p-4"><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 accent-[#22C55E]" checked={enabled} disabled={!loaded||saving} onChange={e=>void update(e.target.checked)}/><span><span className="block font-semibold">Product updates & promotions</span><span className="block text-sm text-[#8B92A3]">Optional product announcements and offers. Transactional billing, security, and account messages are managed separately. Existing provider suppressions are always respected.</span></span></label></div>
}
