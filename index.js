const fs = require('fs')
const path = require('path')
const minimist = require('minimist')
const mkdirp = require('mkdirp')
const chokidar = require('chokidar')

const compile = require('mineral/compilers/html')
const parse = require('mineral/parser')

const argv = minimist(process.argv.slice(2))

// TODO: get a pre-cache all mixins

if (argv.h) {
  console.log(`
    Usage:
      min FILE1, ... [options]

    Options:
      -w           Watch for changes and recompile
      -o DIR       Output directory
      -d '...'     A string of JSON, used as locals
      --data FILE  A path to a JSON file to use as locals
  `)

  process.exit(0)
}

let data = {}

if (argv.d) {
  try {
    data = JSON.parse(argv.d)
  } catch (ex) {
    console.error('Unable to parse data')
    process.exit(1)
  }
} else if (argv.data) {
  try {
    data = require(path.resolve(argv.data))
  } catch (ex) {
    console.error('Unable to read file')
    process.exit(1)
  }
}

const deps = {}

function trunc (s) {
  const parts = s.split('/')
  if (parts.length > 3) return s.replace(process.cwd(), '').slice(1)
  return s
}

function findCommonPath () {
  if (argv._.length === 1) {
    return path.dirname(argv._[0])
  }

  const p = argv._.reduce((a, b) => {
    a = Array.isArray(a) ? a : a.split(path.sep)
    b = Array.isArray(b) ? b : b.split(path.sep)
    return a.filter((s, i) => s === b[i])
  })
  return p.join(path.sep)
}

function compileFile (file) {
  const sourcefile = file
  if (deps[file]) file = deps[file]

  const sourcepath = path.resolve(file)
  const sourcetree = fs.readFileSync(sourcepath, 'utf8')
  const html = compile(parse(sourcetree), data, sourcepath)

  if (!argv.o) {
    return process.stdout.write(html + '\n')
  }

  let common = path.resolve(findCommonPath())

  const out = path.join(
    path.resolve(argv.o),
    path.dirname(sourcepath.replace(common, ''))
  )

  mkdirp.sync(out)

  try {
    const destfile = sourcepath.replace(/\.min$/, '.html')
    const target = path.join(out, path.basename(destfile))
    fs.writeFileSync(target, html)
    console.log(' write: %s <- %s', trunc(target), trunc(sourcefile))
  } catch (ex) {
    console.error(ex)
    process.exit(1)
  }
}

if (!argv.w) {
  argv._.forEach(compileFile)
} else {
  global.watcher = chokidar
    .watch(argv._, { persistent: true, atomic: true })
    .on('add', path => compileFile(path))
    .on('change', path => compileFile(path))
    .on('unlink', path => compileFile(path))
    .on('addDir', path => compileFile(path))
    .on('unlinkDir', path => compileFile(path))

  global.addToWatcher = (origin, p) => {
    const target = path.resolve(path.dirname(origin), p)
    if (deps[target]) return

    deps[target] = origin
    global.watcher.add(target)
    console.log(' watch: %s -> %s', trunc(target), trunc(origin))
  }
}

