begin;
create function public.bm_publish_document(p_kind text,p_version text,p_content text,p_hash text,p_approved boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_kind,1));
 if p_approved then update bm_documents set current=false where kind=p_kind and current; end if;
 insert into bm_documents(kind,version,content,document_hash,approved,current) values(p_kind,p_version,p_content,p_hash,p_approved,p_approved);
end $$;
revoke all on function public.bm_publish_document(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.bm_publish_document(text,text,text,text,boolean) to service_role;
commit;
