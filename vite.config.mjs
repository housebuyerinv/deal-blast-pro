import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const propertyIntelligenceAuthStatusFix = {
  name: 'property-intelligence-auth-status-fix',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/pages/app/DealCalculator.tsx')) return null

    const missingSessionPattern = /if \(!token\) \{\s*throw new Error\('Sign in is required to use Property Intelligence\.'\)\s*\}/
    if (!missingSessionPattern.test(code)) {
      throw new Error('Property Intelligence auth-status patch target was not found.')
    }

    return {
      code: code.replace(
        missingSessionPattern,
        `if (!token) {
      const error = new Error('Sign in is required to use Property Intelligence.')
      ;(error as any).code = 'auth_required'
      ;(error as any).status = 401
      throw error
    }`,
      ),
      map: null,
    }
  },
}

export default defineConfig({
  plugins: [propertyIntelligenceAuthStatusFix, react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
