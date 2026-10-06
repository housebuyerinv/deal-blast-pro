// Contact details belong to the controlled introduction workflow, not chat payloads.
export function safeConversationText(value) {
  return String(value || '').slice(0, 2000)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contact withheld]')
    .replace(/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g, '[contact withheld]');
}
