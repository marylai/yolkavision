import { defineConfig } from 'vite'

export default defineConfig({
  // Relative paths so the build works from a GitHub Pages project
  // subfolder (/<repo-name>/) as well as from the domain root.
  base: './',
})
