'use strict'
const readline = require('bare-readline')
const ansiEscapes = require('bare-ansi-escapes')
const tty = require('bare-tty')
const fs = require('bare-fs')
const os = require('bare-os')
const Realm = require('bare-realm')
const { Writable: BareWritable, Readable: BareReadable } = require('bare-stream')
const { Writable, Readable } = require('streamx')
const hypercoreid = require('hypercore-id-encoding')
const byteSize = require('tiny-byte-size')
const { isWindows } = require('which-runtime')
const { CHECKOUT } = require('pear-constants')
const gracedown = require('pear-gracedown')
const errors = require('pear-errors')
const opwait = require('pear-opwait')
const isTTY = tty.isTTY(0)

function ERR_SIGINT(msg) {
  return new errors(msg, ERR_SIGINT)
}

function renderPrompt(rl, line, linePlain, cursor) {
  const x = cursor % rl._columns
  const y = (cursor - x) / rl._columns
  const offsetX = cursor === linePlain.length ? 0 : 1
  const rows = Math.floor((linePlain.length - offsetX) / rl._columns)
  const offsetY = rows - y

  if (rl._previousRows) rl.write(ansiEscapes.cursorUp(rl._previousRows))
  rl.write(ansiEscapes.cursorPosition(0) + ansiEscapes.eraseDisplayEnd + line)

  if (x === 0 && offsetX === 0) rl.write(readline.constants.EOL)
  else if (offsetY) rl.write(ansiEscapes.cursorUp(offsetY))

  rl.write(ansiEscapes.cursorPosition(x))
  rl._previousRows = rows - offsetY
}

const pt = (arg) => arg
const es = () => ''
const ansi = isWindows
  ? {
      bold: pt,
      dim: pt,
      italic: pt,
      underline: pt,
      inverse: pt,
      red: pt,
      green: pt,
      yellow: pt,
      gray: pt,
      upHome: es,
      link: pt,
      hideCursor: es,
      showCursor: es
    }
  : {
      bold: (s) => `\x1B[1m${s}\x1B[22m`,
      dim: (s) => `\x1B[2m${s}\x1B[22m`,
      italic: (s) => `\x1B[3m${s}\x1B[23m`,
      underline: (s) => `\x1B[4m${s}\x1B[24m`,
      inverse: (s) => `\x1B[7m${s}\x1B[27m`,
      red: (s) => `\x1B[31m${s}\x1B[39m`,
      green: (s) => `\x1B[32m${s}\x1B[39m`,
      yellow: (s) => `\x1B[33m${s}\x1B[39m`,
      gray: (s) => `\x1B[90m${s}\x1B[39m`,
      upHome: (n = 1) => `\x1B[${n}F`,
      link: (url, text = url) => `\x1B]8;;${url}\x07${text}\x1B]8;;\x07`,
      hideCursor: () => '\x1B[?25l',
      showCursor: () => '\x1B[?25h'
    }

ansi.sep = isWindows ? '-' : ansi.dim(ansi.green('∞'))
ansi.tick = isWindows ? '^' : ansi.green('✔')
ansi.cross = isWindows ? 'x' : ansi.red('✖')
ansi.warning = isWindows ? '!' : '⚠️'
ansi.pear = isWindows ? '*' : '🍐'
ansi.dot = isWindows ? 'o' : '•'
ansi.key = isWindows ? '>' : '🔑'
ansi.down = isWindows ? '↓' : '⬇'
ansi.up = isWindows ? '↑' : '⬆'

const stdio = new (class Stdio {
  static WriteStream = class FdWriteStream extends BareWritable {
    constructor(fd) {
      super({
        map: (data) => (typeof data === 'string' ? Buffer.from(data) : data)
      })
      this.fd = fd
    }

    _writev(batch, cb) {
      fs.writev(
        this.fd,
        batch.map(({ chunk }) => chunk),
        cb
      )
    }
  }

  static ReadStream = class FdReadStream extends BareReadable {
    constructor(fd) {
      super()
      this.fd = fd
    }

    _read(size) {
      const buffer = Buffer.alloc(size)
      fs.read(this.fd, buffer, 0, size, null, (err, bytesRead) => {
        if (err) return this.destroy(err)
        if (bytesRead === 0) return this.push(null)
        this.push(buffer.slice(0, bytesRead))
      })
    }
  }

  drained = Writable.drained
  constructor() {
    this._in = null
    this._out = null
    this._err = null
    this.rawMode = false
  }

  get inAttached() {
    return this._in !== null
  }

  get in() {
    if (this._in === null) {
      this._in = tty.isTTY(0) ? new tty.ReadStream(0) : new this.constructor.ReadStream(0)
      this._in.once('close', () => {
        this._in = null
      })
    }
    return this._in
  }

  get out() {
    if (this._out === null) {
      this._out = tty.isTTY(1) ? new tty.WriteStream(1) : new this.constructor.WriteStream(1)
    }
    return this._out
  }

  get err() {
    if (this._err === null) {
      this._err = tty.isTTY(2) ? new tty.WriteStream(2) : new this.constructor.WriteStream(2)
    }
    return this._err
  }

  size() {
    if (!this.out.getWindowSize) return [80, 80]
    const [width, height] = this.out.getWindowSize()
    return { width, height }
  }

  raw(rawMode) {
    this.rawMode = !!rawMode
    return this.in.setMode?.(
      this.rawMode ? this.tty.constants.MODE_RAW : this.tty.constants.MODE_NORMAL
    )
  }
})()

class Interact {
  static rx =
    /[\x1B\x9B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\x07)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g // eslint-disable-line no-control-regex

  constructor(header, params, opts = {}) {
    this._header = header
    this._params = params
    this._defaults = opts.defaults || {}
    this._load =
      opts.load ??
      (() => {
        throw new Error('provide a load function to load params strings')
      })

    const mask = (data, cb) => {
      if (data.length > 4) {
        const prompt = this._prompt
        const regex = new RegExp(`(${prompt})([\\x20-\\x7E]+)`, 'g')
        const masked = data
          .toString()
          .replace(regex, (_, prompt, pwd) => prompt + '*'.repeat(pwd.length))
        stdio.out.write(masked)
      } else {
        stdio.out.write(data)
      }
      cb(null)
    }

    this._rl = readline.createInterface({
      input: stdio.in,
      output: opts.masked ? new Writable({ write: mask }) : stdio.out
    })
    this._rl.on('close', () => {
      console.log()
    })
    stdio.in?.setMode?.(tty.constants.MODE_RAW)
  }

  run(opts) {
    const out = new Readable()
    this._run(opts, out)
    return out
  }

  async _run(opts, out) {
    try {
      if (opts?.autosubmit) {
        const res = this.#autosubmit()
        out.push({ type: 'autosubmit', value: res })
        out.push(null)
        return
      }

      stdio.out.write(this._header)
      await this._loop(this._params, out, [], null)
      out.push({ tag: 'final', data: { success: true } })
      out.push(null)
    } catch (err) {
      out.destroy(err)
    } finally {
      if (stdio.inAttached) stdio.in.destroy()
    }
  }

  async _loop(params, out, trail, field) {
    params = Array.isArray(params) ? params : [params]
    while (params.length) {
      const param = params.shift()
      while (true) {
        const done = await this._next(param, out, trail, field)
        if (done) break
      }
    }
  }

  async _next(param, out, trail, field) {
    const defaults = this._defaults
    const deflt = defaults[param.name] ?? param.default
    const selection = Array.isArray(param.select)

    let answer = selection
      ? await this.#select(param.prompt, param.select)
      : typeof param.params === 'string'
        ? ''
        : await this.#input(`${param.prompt}${param.delim || ':'} `, deflt ? `(${deflt})` : '')

    if (answer.length === 0) answer = defaults[param.name] ?? deflt

    let choice = null
    let tag = 'input'

    if (selection) {
      const ix = Number(answer) || 0
      const selected = param.select[ix] ?? param.select[0]
      choice = selected.prompt ?? selected.name ?? String(ix)
      param.params = selected.params
      answer = param.params
      tag = 'select'
    } else if (typeof param.params === 'string') {
      answer = param.params
    }

    if (typeof param.validation === 'string') {
      const realm = new Realm()
      param.validation = realm.evaluate(param.validation)
    }

    if (param.validation && !(await param.validation(answer))) {
      stdio.out.write(param.msg + '\n')
      return false
    }

    if (typeof answer === 'string') answer = answer.replace(this.constructor.rx, '')

    const base = param.name === field ? trail : trail.concat(param.name)
    const isGroup = typeof param.params === 'string'

    if (selection) {
      const selected = base.concat(choice)
      out.push({ tag, data: { trail: selected, name: choice, answer } })
      if (isGroup) {
        out.push({ tag: 'enter', data: { trail: selected, name: param.name, answer: answer } })
        param.params = await this._load(param.params)
        await this._loop(param.params, out, selected, choice)
        out.push({ tag: 'exit', data: { trail: selected, name: param.name, answer: answer } })
      }
      return true
    }

    if (isGroup) {
      out.push({ tag: 'enter', data: { trail: base, name: param.name, answer } })
      param.params = await this._load(param.params)
      await this._loop(param.params, out, base, param.name)
      out.push({ tag: 'exit', data: { trail: base, name: param.name, answer } })
      return true
    }

    const shave =
      Array.isArray(param.shave) && param.shave.every((ix) => typeof ix === 'number')
        ? param.shave
        : undefined
    out.push({ tag, data: { trail: base, name: param.name, answer, shave } })
    return true
  }

  #autosubmit() {
    const fields = {}
    const shave = {}
    const defaults = this._defaults
    while (this._params.length) {
      const param = this._params.shift()
      fields[param.name] = defaults[param.name] ?? param.default
      if (Array.isArray(param.shave) && param.shave.every((ix) => typeof ix === 'number')) {
        shave[param.name] = param.shave
      }
    }
    return { fields, shave }
  }

  async #select(prompt, select) {
    return (
      (await this.#input(
        prompt + ' [' + select.map(({ prompt }, index) => index + ':' + prompt).join(' ') + ']\n> '
      )) || '0'
    )
  }

  async #input(prompt, placeholder) {
    const lastNewline = prompt.lastIndexOf('\n')
    if (lastNewline !== -1) {
      stdio.out.write(prompt.slice(0, lastNewline + 1))
      prompt = prompt.slice(lastNewline + 1)
    }
    this._prompt = prompt
    if (this._rl.setPrompt) this._rl.setPrompt(prompt)
    if (placeholder) this.#enablePlaceholder(placeholder)
    if (this._rl.prompt) this._rl.prompt()
    else stdio.out.write(prompt)
    try {
      const answer = await new Promise((resolve, reject) => {
        this._rl.once('data', (data) => resolve(data))
        stdio.in?.once('data', (data) => {
          if (data.length === 1 && data[0] === 3) {
            reject(ERR_SIGINT('^C exit'))
            os.kill(Pear.pid, 'SIGINT')
          }
        })
      })
      return answer.toString().trim()
    } finally {
      this.#disablePlaceholder()
    }
  }

  #enablePlaceholder(placeholder) {
    const rl = this._rl
    if (!rl._placeholderPatched) {
      rl._placeholderPatched = true
      rl._origPrompt = rl.prompt.bind(rl)
      function promptWithPlaceholder() {
        if (!this._placeholder) return this._origPrompt()

        const showPlaceholder = this._line.length === 0
        const placeholderText = showPlaceholder ? this._placeholder.plain : ''
        const placeholderStyled = showPlaceholder ? this._placeholder.styled : ''
        const line = this._prompt + placeholderStyled + this._line
        const linePlain = this._prompt + placeholderText + this._line
        const cursor = this._prompt.length + this._cursor

        renderPrompt(this, line, linePlain, cursor)
      }
      rl.prompt = promptWithPlaceholder
    }

    const plain = placeholder
    const styled = ansi.dim(placeholder)
    rl._placeholder = { plain, styled }
  }

  #disablePlaceholder() {
    if (this._rl) this._rl._placeholder = null
  }
}

let statusFrag = ''

function status(msg, success) {
  msg = msg || ''
  const done = typeof success === 'boolean'
  if (msg) stdio.out.write(`\x1B[2K\r${indicator(success)}${msg}\n${done ? '' : ansi.upHome()}`)
  statusFrag = msg.slice(0, 3)
}

function print(message, success) {
  statusFrag = ''
  console.log(`${typeof success !== 'undefined' ? indicator(success) : ''}${message}`)
}

function byteDiff({ type, sizes, message }) {
  statusFrag = ''
  sizes = sizes.map((size) => (size > 0 ? '+' : '') + byteSize(size)).join(', ')
  print(indicator(type, 'diff') + ' ' + message + ' (' + sizes + ')')
}

function indicator(value, type = 'success') {
  if (value === undefined) return ''
  if (value === true) value = 1
  else if (value === false) value = -1
  else if (value === null) value = 0
  if (type === 'diff') {
    return value === 0 ? ansi.yellow('~') : value === 1 ? ansi.green('+') : ansi.red('-')
  }
  return value < 0 ? ansi.cross + ' ' : value === 1 ? ansi.tick + ' ' : (value > 1 ? '' : ansi.gray('- '))
}

const outputter =
  (cmd, taggers = {}) =>
  (opts, stream, info = {}, ipc) => {
    if (Array.isArray(stream)) stream = Readable.from(stream)
    const asTTY = opts.ctrlTTY ?? isTTY
    if (asTTY) stdio.out.write(ansi.hideCursor())
    const dereg = asTTY
      ? gracedown(() => {
          if (!isWindows) stdio.out.write('\x1B[1K\x1B[G' + statusFrag) // clear ^C
          stdio.out.write(ansi.showCursor())
        })
      : null
    if (typeof opts === 'boolean' || typeof opts === 'function') opts = { json: opts }
    const { json = false, log } = opts
    const promise = opwait(stream, ({ tag, data }) => {
      if (json) {
        const replacer = typeof json === 'function' ? json : null
        const str = JSON.stringify({ cmd, tag, data }, replacer)
        if (log) log(str)
        else print(str)
        return
      }

      const transform = Promise.resolve(
        typeof taggers[tag] === 'function' ? taggers[tag](data, info, ipc) : taggers[tag] || false
      )
      transform.then(
        (result) => {
          if (result === undefined) return
          if (typeof result === 'string') result = { output: 'print', message: result }
          if (result === false) {
            if (tag === 'final') {
              result = {
                output: 'print',
                message: (data.message ?? data.success) ? 'Success' : 'Failure'
              }
            } else result = {}
          }
          result.success = result.success ?? data?.success
          const { output, message, success = data?.success } = result
          if (log) {
            const logOpts = { output, ...(typeof success === 'boolean' ? { success } : {}) }
            if (Array.isArray(message) === false) log(message, logOpts)
            else for (const msg of message) log(msg, logOpts)
            return
          }
          let msg = Array.isArray(message) ? message.join('\n') : message
          if (tag === 'final') {
            msg += '\n'
            if (asTTY) {
              stdio.out.write(ansi.showCursor())
              dereg(false)
            }
          }

          if (output === 'print') print(msg, success)
          else if (output === 'status') status(msg, success)
        },
        (err) => stream.destroy(err)
      )
    })

    return promise
  }

const banner = `${ansi.bold('Pear')} ~ ${ansi.dim('Welcome to the Internet of Peers')}`
const version = `${CHECKOUT.fork || 0}.${CHECKOUT.length || 'dev'}.${CHECKOUT.key}`
const header = `  ${banner}
  ${ansi.pear + ' '}${ansi.bold(ansi.gray('v' + version))}
`
const urls =
  ansi.link('https://pears.com', 'pears.com') +
  ' | ' +
  ansi.link('https://holepunch.to', 'holepunch.to') +
  ' | ' +
  ansi.link('https://keet.io', 'keet.io')

const footer = {
  overview: `  ${ansi.bold('Legend:')} [arg] = optional, <arg> = required, | = or \n  Run ${ansi.bold('pear help')} to output full help for all commands\n  For command help: ${ansi.bold('pear help [cmd]')} or ${ansi.bold('pear [cmd] -h')}\n
${ansi.pear + ' '}${version}\n${urls}\n${ansi.bold(ansi.dim('Pear'))} ~ ${ansi.dim('Welcome to the IoP')}`,
  help: `${ansi.pear + ' '}${version}
${urls}\n${ansi.bold(ansi.dim('Pear'))} ~ ${ansi.dim('Welcome to the IoP')}
  `
}

const usage = { header, version, banner, footer }

async function trust(ipc, key, cmd) {
  const explain = {
    run:
      'Be sure that software is trusted before running it\n' +
      '\nType "TRUST" to allow execution or anything else to exit\n\n',
    init:
      'This template is not trusted.\n' +
      '\nType "TRUST" to trust this template, or anything else to exit\n\n'
  }

  const act = {
    run: 'Use pear run again to execute trusted application',
    init: 'Use pear init again to initalize from trusted template'
  }

  const ask = {
    run: 'Trust application',
    init: 'Trust template'
  }

  const z32 = hypercoreid.encode(key)
  const dialog = ansi.cross + ' Key pear://' + z32 + ' is not known\n\n' + explain[cmd]
  const delim = '?'
  const validation = (value) => value === 'TRUST'
  const msg = '\n' + ansi.cross + ' uppercase TRUST to confirm\n'

  const interact = new Interact(dialog, [
    {
      name: 'value',
      default: '',
      prompt: ask[cmd],
      delim,
      validation,
      msg
    }
  ])

  await opwait(interact.run())
  await ipc.permit({ key })
  print('\n' + ansi.tick + ' pear://' + z32 + ' is now trusted\n')
  print(act[cmd] + '\n')
  await ipc.close()
  Bare.exit()
}

async function password(ipc, key, cmd) {
  const z32 = hypercoreid.normalize(key)

  const explain = {
    run:
      'pear://' +
      z32 +
      ' is an encrypted application. \n' +
      '\nEnter the password to run the app.\n\n',
    stage: 'This application is encrypted.\n' + '\nEnter the password to stage the app.\n\n',
    seed: 'This application is encrypted.\n' + '\nEnter the password to seed the app.\n\n',
    dump: 'This application is encrypted.\n' + '\nEnter the password to dump the app.\n\n',
    init: 'This template is encrypted.\n' + '\nEnter the password to init from the template.\n\n',
    info: 'This application is encrypted.\n' + '\nEnter the password to retrieve info.\n\n'
  }

  const message = {
    run: 'Added encryption key for pear://' + z32,
    stage: 'Added encryption key, run stage again to complete it.',
    seed: 'Added encryption key, run seed again to complete it.',
    dump: 'Added encryption key, run dump again to complete it.',
    init: 'Added encryption key, run init again to complete it.',
    info: 'Added encryption key, run info again to complete it.'
  }

  const dialog = ansi.cross + ' ' + explain[cmd]
  const ask = 'Password'
  const delim = ':'
  const validation = (key) => key.length > 0
  const msg = '\nPlease, enter a valid password.\n'
  const interact = new Interact(
    dialog,
    [
      {
        name: 'password',
        default: '',
        prompt: ask,
        delim,
        validation,
        msg
      }
    ],
    { masked: true }
  )
  let password = null
  await opwait(interact.run(), ({ tag, data }) => {
    if (tag === 'input' && data.name === 'password') password = data.answer
  })
  print(`\n${ansi.key} Hashing password...`)
  await ipc.permit({ key, password })
  print('\n' + ansi.tick + ' ' + message[cmd] + '\n')
  await ipc.close()
  Bare.exit()
}

function permit(ipc, info, cmd) {
  const key = info.key
  if (info.encrypted) {
    return password(ipc, key, cmd)
  } else {
    return trust(ipc, key, cmd)
  }
}

async function confirm(dialog, ask, delim, validation, msg) {
  const interact = new Interact(dialog, [
    {
      name: 'confirm',
      default: '',
      prompt: ask,
      delim,
      validation,
      msg
    }
  ])
  await opwait(interact.run())
}

function explain(bail = {}) {
  if (!bail.reason && bail.err) {
    const known = errors.known()
    if (known.includes(bail.err.code) === false) {
      print(
        errors.ERR_UNKNOWN(
          'Unknown [ code: ' + (bail.err.code || '(none)') + ' ] ' + bail.err.stack
        ),
        false
      )
      Bare.exit(1)
    }
  }
  const messageUsage = (bail) => bail.err.message
  const messageOnly = (bail) => bail.err.message
  const opFail = (cmd) => cmd.err.info.message
  const codemap = new Map([
    ['UNKNOWN_FLAG', (bail) => 'Unrecognized Flag: --' + bail.flag.name],
    [
      'UNKNOWN_ARG',
      (bail) => 'Unrecognized Argument at index ' + bail.arg.index + ' with value ' + bail.arg.value
    ],
    ['MISSING_ARG', (bail) => bail.arg.value],
    ['INVALID', messageUsage],
    ['ERR_INVALID_INPUT', messageUsage],
    ['ERR_LEGACY', messageOnly],
    ['ERR_INVALID_TEMPLATE', messageOnly],
    ['ERR_DIR_NONEMPTY', messageOnly],
    ['ERR_OPERATION_FAILED', opFail]
  ])
  const nouse = [messageOnly, opFail]
  const code = codemap.has(bail.err?.code) ? bail.err.code : bail.reason
  const ref = codemap.get(code)
  const reason = codemap.has(code) ? (codemap.get(code)(bail) ?? bail.reason) : bail.reason
  Bare.exitCode = 1

  print(reason, false)

  if (nouse.some((fn) => fn === ref) || codemap.has(code) === false) return

  print('\n' + bail.command.usage())
}

module.exports = {
  explain,
  usage,
  permit,
  stdio,
  ansi,
  indicator,
  status,
  print,
  outputter,
  isTTY,
  confirm,
  byteSize,
  byteDiff,
  Interact
}
