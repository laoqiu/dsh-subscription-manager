/** Build the native Client module with the host's shared runtime imports. */
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))
await build({
  entryPoints: ['src/client.tsx'], outfile: 'lib/client.js', bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@deepseek-ai/*'],
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
  footer: { js: 'return module.exports;}});' },
})
