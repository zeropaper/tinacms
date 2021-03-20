const tsup = require('tsup')
const { watch } = require('chokidar')
const fs = require('fs')
const path = require('path')
const fg = require('fast-glob')

const run = async () => {
  const lerna = JSON.parse(
    await fs.readFileSync(path.join(process.cwd(), 'lerna.json')).toString()
  )
  // FIXME: probs need to make sure this only runs for packages
  // so demos and things like that don't run
  const entries = await fg(lerna.packages, { dot: true, onlyDirectories: true })

  const watcher = watch(
    entries.map(entry => `${entry}/src/**/*`),
    {
      ignoreInitial: true,
      ignorePermissionErrors: true,
      ignored: ['**/{.git,node_modules}/**', 'build', 'dist'],
    }
  )
  const findParentPkgDesc = async directory => {
    if (!directory) {
      directory = path.dirname(module.parent.filename)
    }
    const file = path.resolve(directory, 'package.json')
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return file
    }
    const parent = path.resolve(directory, '..')
    if (parent === directory) {
      return null
    }
    return findParentPkgDesc(parent)
  }
  watcher.on('all', async (type, file) => {
    console.log('CLI', 'info', `Change detected: ${type} ${file}`)
    const pd = await findParentPkgDesc(path.dirname(file))
    const pkg = JSON.parse(await fs.readFileSync(pd).toString())
    const pkgDir = path.dirname(pd)
    const outDir = path.resolve(pkgDir, path.dirname(pkg.main))
    const origDir = process.cwd()
    // set the cwd to the package that changed
    // so tsup can run as if it was initialized there
    process.chdir(pkgDir)
    const config = {
      entryPoints: path.resolve(pkgDir, 'src', 'index.ts'),
      outDir: outDir,
      dts: true,
      format: ['cjs'],
    }
    await tsup.build(config)
    // set the cwd back to the original
    process.chdir(origDir)
  })
}

run()
