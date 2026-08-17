const { spawnSync } = require('node:child_process')
const path = require('node:path')

const result = spawnSync(process.execPath, [path.join(__dirname, 'index.cjs')], {
  env: process.env,
  encoding: 'utf8',
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)

if (result.status !== 0) {
  const details = `${result.stdout || ''}\n${result.stderr || ''}`
    .trim()
    .split('\n')
    .slice(-12)
    .join(' ')
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')

  process.stdout.write(`::error title=Deploy diagnostic::${details}\n`)
  process.exit(result.status || 1)
}
