'use strict'
global.Pear = null

const { isWindows, isBare } = require('which-runtime')
const process = require('process')
const IPC = require('pear-ipc')
const path = require('bare-path')
const fs = require('bare-fs')
const { Readable } = require('streamx')
const { pathToFileURL } = require('url-file-url')

const dirname = __dirname
const socketPath = isWindows ? '\\\\.\\pipe\\pear-api-test-ipc' : 'test.sock'
const STOP_CHAR = '\n'
const BUILTINS = new Set(require('bare-module').builtinModules)

const noop = () => {}

class Helper {
  static rig({
    ipc = { ref: noop, unref: noop },
    state = { config: { applink: 'pear://keet' }, applink: 'pear://keet' },
    runtimeArgv,
    clearRequireCache
  } = {}) {
    if (!require.main.url) require.main.url = pathToFileURL(__filename)
    if (global.Pear !== null) {
      console.error(global.Pear)
      throw Error('Prior Pear global not cleaned up')
    }

    class RigAPI {
      static RTI = { checkout: { key: dirname, length: null, fork: null } }
    }
    global.Pear = new RigAPI()
    const program = global.Bare ?? global.process

    const API = require('..')
    class TestAPI extends API {
      static RUNTIME = program.argv[0]
      static RUNTIME_ARGV = runtimeArgv ?? [path.join(dirname, 'run.js')]
      static RTI = RigAPI.RTI
    }

    const argv = [...program.argv]
    program.argv.length = 0
    program.argv.push('pear', 'run', ...argv.slice(1))
    global.Pear = new TestAPI(ipc, state)

    return () => {
      if (clearRequireCache) {
        delete require.cache[
          isBare
            ? pathToFileURL(require.resolve(clearRequireCache))
            : require.resolve(clearRequireCache)
        ]
      }
      program.argv.length = 0
      program.argv.push(...argv)
      global.Pear = null
    }
  }

  static rigPearGlobal() {
    if (global.Pear !== null) {
      console.error(global.Pear)
      throw Error(`Prior Pear global not cleaned up: ${global.Pear}`)
    }

    class RigAPI {
      static RTI = { checkout: { key: dirname, length: null, fork: null } }
    }
    global.Pear = new RigAPI()

    return () => {
      global.Pear = null
    }
  }

  static async untilResult(pipe, opts = {}) {
    const timeout = opts.timeout || 10000
    const res = new Promise((resolve, reject) => {
      let buffer = ''
      const timeoutId = setTimeout(() => reject(new Error('timed out')), timeout)
      pipe.on('data', (data) => {
        buffer += data.toString()
        if (buffer[buffer.length - 1] === STOP_CHAR) {
          clearTimeout(timeoutId)
          resolve(buffer.trim())
        }
      })
      pipe.on('close', () => {
        clearTimeout(timeoutId)
        reject(new Error('unexpected closed'))
      })
      pipe.on('end', () => {
        clearTimeout(timeoutId)
        reject(new Error('unexpected ended'))
      })
    })
    if (opts.runFn) {
      await opts.runFn()
    } else {
      pipe.write('start')
    }
    return res
  }

  static async untilClose(pipe, opts = {}) {
    const res = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('timed out')), opts.timeout ?? 5000)
      pipe.on('close', () => {
        clearTimeout(timeoutId)
        resolve('closed')
      })
      pipe.on('end', () => {
        clearTimeout(timeoutId)
        resolve('ended')
      })
    })
    if (opts.runFn) {
      await opts.runFn()
    } else {
      pipe.end()
    }
    return res
  }

  static async isRunning(pid) {
    try {
      // 0 is a signal that doesn't kill the process, just checks if it's running
      return global.process ? process.kill(pid, 0) : require('bare-os').kill(pid, 0)
    } catch (err) {
      return err.code === 'EPERM'
    }
  }

  static async untilExit(pid, timeout = 5000) {
    if (!pid) throw new Error('Invalid pid')
    const start = Date.now()
    while (await this.isRunning(pid)) {
      if (Date.now() - start > timeout) throw new Error('timed out')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  static async untilExists(path, timeout = 5000, start = Date.now()) {
    if (Date.now() - start > timeout) throw new Error('timed out')
    try {
      await fs.promises.stat(path)
      return true
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
    await Helper.untilExists(path, timeout, start)
  }

  static async untilHandler(handler, timeout = 5000, start = Date.now()) {
    if (Date.now() - start > timeout) throw new Error('timed out')
    try {
      const res = await handler()
      if (res) return res
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
    await Helper.untilHandler(handler, timeout, start)
  }

  static async startIpcClient() {
    const client = new IPC.Client({ socketPath })
    await client.ready()
    return client
  }

  static async startIpcServer({ handlers, teardown }) {
    const server = new IPC.Server({ socketPath, handlers })
    teardown(() => server.close())
    await server.ready()
    return server
  }

  static captureConsole() {
    const originalConsoleLog = console.log
    let output = ''
    console.log = (str) => {
      output += str + '\n'
    }
    return {
      restore: () => {
        console.log = originalConsoleLog
      },
      get output() {
        return output
      },
      clear() {
        output = ''
      }
    }
  }

  static stubTTY({ onWrite, isTTY = true } = {}) {
    let output = ''
    const restore = Helper.override('bare-tty', {
      isTTY: () => isTTY,
      WriteStream: class {
        write = (str) => {
          output += str
          if (onWrite) onWrite(str)
        }
      },
      ReadStream: class extends Readable {
        setMode = () => {}
      }
    })

    return {
      restore,
      get output() {
        return output
      },
      clear() {
        output = ''
      }
    }
  }

  static stubReadline(createInterface) {
    return Helper.override('bare-readline', { createInterface })
  }

  static stubReadlineInput(data) {
    const createInterface = () => ({
      _prompt: '',
      once: (event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from(data)), 10)
        }
      },
      on: () => {},
      off: () => {},
      input: { setMode: () => {} },
      close: () => {}
    })
    return Helper.override('bare-readline', { createInterface })
  }

  static captureExit() {
    const originalExit = isBare ? Bare.exit : process.exit
    let resolveExit
    const exited = new Promise((resolve) => {
      resolveExit = resolve
    })
    if (isBare) Bare.exit = () => resolveExit(true)
    else process.exit = () => resolveExit(true)

    return {
      exited,
      restore: () => {
        if (isBare) Bare.exit = originalExit
        else process.exit = originalExit
      }
    }
  }

  static override(moduleName, override) {
    const modulePath = isBare
      ? pathToFileURL(require.resolve(moduleName))
      : require.resolve(moduleName)
    if (BUILTINS.has(moduleName)) {
      require.cache[modulePath] = {
        exports: typeof override === 'function' ? override : { ...require(moduleName), ...override }
      }
      return () => {
        delete require.cache[moduleName]
      }
    }

    if (!require.cache[modulePath]) require(moduleName)
    const original = require.cache[modulePath].exports
    require.cache[modulePath].exports =
      typeof override === 'function' ? override : { ...original, ...override }
    return () => {
      if (require.cache[modulePath]) require.cache[modulePath].exports = original
    }
  }

  static forget(moduleName) {
    const modulePath = isBare
      ? pathToFileURL(require.resolve(moduleName))
      : require.resolve(moduleName)
    if (require.cache[modulePath]) delete require.cache[modulePath]
  }
}

module.exports = Helper
