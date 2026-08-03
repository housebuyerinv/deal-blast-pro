export const WORKSPACE_NAME_FALLBACK = 'My Workspace'

const PLACEHOLDER_NAMES = new Set([
  'test', 'testing', 'demo', 'sample', 'placeholder', 'workspace', 'my workspace',
  'company', 'business', 'organization', 'org', 'asdf', 'qwerty', 'n/a', 'none',
])

export function sanitizeWorkspaceName(value: unknown) {
  const withoutControls = Array.from(String(value ?? '').normalize('NFKC'), character => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127 ? ' ' : character
  }).join('')
  return withoutControls
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

export function isValidWorkspaceName(value: unknown) {
  const name = sanitizeWorkspaceName(value)
  if (name.length < 2 || PLACEHOLDER_NAMES.has(name.toLowerCase())) return false
  if (!/[\p{L}\p{N}]/u.test(name)) return false
  if (/^(.)\1{2,}(.)\2{2,}$/iu.test(name.replace(/\s/g, ''))) return false
  return true
}

export function getWorkspaceDisplayName(...values: unknown[]) {
  for (const value of values) {
    const name = sanitizeWorkspaceName(value)
    if (isValidWorkspaceName(name)) return name
  }
  return WORKSPACE_NAME_FALLBACK
}

export function validateWorkspaceNameInput(value: unknown) {
  const name = sanitizeWorkspaceName(value)
  if (!name) return { valid: true, value: '', error: '' }
  if (!isValidWorkspaceName(name)) {
    return {
      valid: false,
      value: name,
      error: 'Enter a real workspace or company name, or leave it blank to use My Workspace.',
    }
  }
  return { valid: true, value: name, error: '' }
}
