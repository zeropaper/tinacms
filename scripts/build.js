const tsup = require('tsup')
const { watch } = require('chokidar')
const fs = require('fs')
const path = require('path')
const fg = require('fast-glob')

const run = async () => {
  const lerna = JSON.parse(
    await fs.readFileSync(path.join(process.cwd(), 'lerna.json')).toString()
  )
  // console.log(lerna.packages)
  const entries = await fg(lerna.packages, { dot: true, onlyDirectories: true })

  // console.log(entries.map(entry => `${entry}/src/**/*`))
  const watcher = watch(
    // ['./packages/tinacms/**/*', './packages/@tinacms/react-sidebar/**/*'],
    entries.map(entry => `${entry}/src/**/*`),
    // ['.'],
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
    const outFile = path.resolve(pkgDir, pkg.main)
    const origDir = process.cwd()
    const changedFileFullPath = path.resolve(origDir, file)
    if (changedFileFullPath === outFile) {
      console.log(changedFileFullPath)
      console.log('change was the build file, ignoring...')
      return
    }
    process.chdir(pkgDir)
    console.log(process.cwd())
    const config = {
      entryPoints: path.resolve(pkgDir, 'src', 'index.ts'),
      outDir: outDir,
      // ignoreWatch: [ouDir, path.basename(outDir)],
      // dts: true,
      format: ['cjs'],
    }
    // console.log(config)

    await tsup.build(config)
    process.chdir(origDir)
  })
}

run()
