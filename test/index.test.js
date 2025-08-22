'use strict'
/* global Bare */
const { test } = require('brittle')
const hypercoreid = require('hypercore-id-encoding')
const { isBare } = require('which-runtime')
const process = require('process')
const Helper = require('./helper')
const { Readable } = require('streamx')

const testOptions = { skip: !isBare }

const dirname = __dirname
global.Pear = null

const rig = () => {
  if (global.Pear !== null) throw Error(`Prior Pear global not cleaned up: ${global.Pear}`)

  class RigAPI {
    static RTI = { checkout: { key: dirname, length: null, fork: null } }
  }
  global.Pear = new RigAPI()

  return {
    teardown: () => { global.Pear = null }
  }
}

test('indicator function', testOptions, async function (t) {
  t.plan(6)

  const { teardown } = rig()
  t.teardown(teardown)

  const { indicator, ansi } = require('..')
  t.teardown(() => { Helper.forget('..') })

  t.is(indicator(true), ansi.tick + ' ', 'indicator should return tick for true')
  t.is(indicator(false), ansi.cross + ' ', 'indicator should return cross for false')
  t.is(indicator(null), ansi.gray('- '), 'indicator should return gray dash for null')
  t.is(indicator(1), ansi.tick + ' ', 'indicator should return tick for positive number')
  t.is(indicator(-1), ansi.cross + ' ', 'indicator should return cross for negative number')
  t.is(indicator(0), ansi.gray('- '), 'indicator should return gray dash for zero')
})

test('status function', testOptions, async function (t) {
  t.plan(3)

  const { teardown } = rig()
  t.teardown(teardown)

  let output = ''
  const restoreTTY = Helper.override('bare-tty', {
    isTTY: () => true,
    WriteStream: class { write = (str) => { output += str } },
    ReadStream: class extends Readable { setMode = () => {} }
  })
  t.teardown(restoreTTY)

  const { status, ansi } = require('..')
  t.teardown(() => { Helper.forget('..') })

  status('Test message', true)
  t.ok(output.includes(ansi.tick + ' Test message'), 'status should print success message correctly')

  output = ''
  status('Test message', false)
  t.ok(output.includes(ansi.cross + ' Test message'), 'status should print failure message correctly')

  output = ''
  status('Test message')
  t.ok(output.includes('Test message'), 'status should print message without success indicator')
})

test('print function', testOptions, async function (t) {
  t.plan(3)

  const { teardown } = rig()
  t.teardown(teardown)

  const { print, ansi } = require('..')
  t.teardown(() => { Helper.forget('..') })

  const originalConsoleLog = console.log
  let output = ''
  console.log = (str) => { output += str }
  t.teardown(() => { console.log = originalConsoleLog })

  print('Test message', true)
  t.ok(output.includes(ansi.tick + ' Test message'), 'print should print success message correctly')

  output = ''
  print('Test message', false)
  t.ok(output.includes(ansi.cross + ' Test message'), 'print should print failure message correctly')

  output = ''
  print('Test message')
  t.ok(output.includes('Test message'), 'print should print message without success indicator')
})

test('confirm function with valid input', testOptions, async function (t) {
  t.plan(1)

  const { teardown } = rig()
  t.teardown(teardown)

  const mockCreateInterface = () => ({
    _prompt: '',
    once: (event, callback) => {
      if (event === 'data') {
        setTimeout(() => callback(Buffer.from('YES\n')), 10)
      }
    },
    on: () => {},
    off: () => {},
    input: { setMode: () => {} },
    close: () => {}
  })
  const restoreReadLine = Helper.override('bare-readline', { createInterface: mockCreateInterface })
  t.teardown(restoreReadLine)

  let output = ''
  const restoreTTY = Helper.override('bare-tty', {
    isTTY: () => true,
    WriteStream: class { write = (str) => { output += str } },
    ReadStream: class extends Readable { setMode = () => {} }
  })
  t.teardown(restoreTTY)

  const { ansi, confirm } = require('..')
  t.teardown(() => { Helper.forget('..') })

  const dialog = `${ansi.warning} Are you sure you want to proceed?`
  const ask = 'Type YES to confirm'
  const delim = ':'
  const validation = (value) => value === 'YES'
  const msg = 'Invalid input. Please type YES to confirm.'

  await confirm(dialog, ask, delim, validation, msg)
  t.ok(output.includes('YES'), 'confirm should accept valid input')
})

test('confirm function with invalid input', testOptions, async function (t) {
  t.plan(1)

  const { teardown } = rig()
  t.teardown(teardown)

  const mockCreateInterface = () => ({
    _prompt: '',
    once: (event, callback) => {
      if (event === 'data') {
        setTimeout(() => callback(Buffer.from('NO\n')), 10)
      }
    },
    on: () => {},
    off: () => {},
    input: { setMode: () => {} },
    close: () => {}
  })
  const restoreReadLine = Helper.override('bare-readline', { createInterface: mockCreateInterface })
  t.teardown(restoreReadLine)

  let output = ''
  const restoreTTY = Helper.override('bare-tty', {
    isTTY: () => true,
    WriteStream: class {
      write = (str) => {
        output += str
        if (str.includes('Invalid input')) throw Error('Invalid input')
      }
    },
    ReadStream: class extends Readable { setMode = () => {} }
  })
  t.teardown(restoreTTY)

  const { ansi, confirm } = require('..')
  t.teardown(() => { Helper.forget('..') })

  const dialog = `${ansi.warning} Are you sure you want to proceed?`
  const ask = 'Type YES to confirm'
  const delim = ':'
  const validation = (value) => value === 'YES'
  const msg = 'Invalid input. Please type YES to confirm.'

  try {
    await confirm(dialog, ask, delim, validation, msg)
  } catch {
    t.ok(output.includes('Invalid input'), 'confirm should reject invalid input')
  }
})

test('permit function with unencrypted key', testOptions, async function (t) {
  t.plan(4)

  const { teardown } = rig()
  t.teardown(teardown)

  const mockCreateInterface = () => ({
    _prompt: '',
    once: (event, callback) => {
      if (event === 'data') {
        setTimeout(() => callback(Buffer.from('TRUST\n')), 10)
      }
    },
    on: () => {},
    off: () => {},
    input: { setMode: () => {} },
    close: () => {}
  })
  const restoreReadLine = Helper.override('bare-readline', { createInterface: mockCreateInterface })
  t.teardown(restoreReadLine)

  const { ansi, permit } = require('..')
  t.teardown(() => { Helper.forget('..') })

  const originalExit = isBare ? Bare.exit : process.exit
  const exited = new Promise((resolve) => {
    if (isBare) Bare.exit = () => resolve(true)
    else process.exit = () => resolve(true)
  })
  t.teardown(() => {
    if (isBare) Bare.exit = originalExit
    else process.exit = originalExit
  })

  let output = ''
  const originalConsoleLog = console.log
  console.log = (str) => { output += str }
  t.teardown(() => { console.log = originalConsoleLog })

  const mockKey = hypercoreid.decode('d47c1dfecec0f74a067985d2f8d7d9ad15f9ae5ff648f7bc6ca28e41d70ed221')
  const mockIpc = {
    permit: async ({ key }) => {
      t.is(key, mockKey, 'permit should call ipc.permit with the correct key')
    },
    close: async () => {
      t.pass('ipc.close should be called')
    }
  }
  const mockInfo = { key: mockKey, encrypted: false }
  const mockCmd = 'run'

  await permit(mockIpc, mockInfo, mockCmd)
  t.ok(output.includes(`${ansi.tick} pear://${hypercoreid.encode(mockKey)} is now trusted`), 'permit should print trust confirmation message')

  const exitedRes = await exited
  t.is(exitedRes, true, 'Pear.exit ok')
})

test('permit function with encrypted key', testOptions, async function (t) {
  t.plan(5)

  const { teardown } = rig()
  t.teardown(teardown)

  const mockPassword = 'MYPASSWORD'

  const mockCreateInterface = () => ({
    _prompt: '',
    once: (event, callback) => {
      if (event === 'data') {
        setTimeout(() => callback(Buffer.from(`${mockPassword}\n`)), 10)
      }
    },
    on: () => {},
    off: () => {},
    input: { setMode: () => {} },
    close: () => {}
  })
  const restoreReadLine = Helper.override('bare-readline', { createInterface: mockCreateInterface })
  t.teardown(restoreReadLine)

  const { ansi, permit } = require('..')
  t.teardown(() => { Helper.forget('..') })

  const originalExit = isBare ? Bare.exit : process.exit
  const exited = new Promise((resolve) => {
    if (isBare) Bare.exit = () => resolve(true)
    else process.exit = () => resolve(true)
  })
  t.teardown(() => {
    if (isBare) Bare.exit = originalExit
    else process.exit = originalExit
  })

  let output = ''
  const originalConsoleLog = console.log
  console.log = (str) => { output += str }
  t.teardown(() => { console.log = originalConsoleLog })

  const mockKey = hypercoreid.decode('d47c1dfecec0f74a067985d2f8d7d9ad15f9ae5ff648f7bc6ca28e41d70ed221')
  const mockIpc = {
    permit: async ({ key, password }) => {
      t.is(key, mockKey, 'permit should call ipc.permit with the correct key')
      t.is(password, mockPassword, 'permit should call ipc.permit with the correct password')
    },
    close: async () => {
      t.pass('ipc.close should be called')
    }
  }
  const mockInfo = { key: mockKey, encrypted: true }
  const mockCmd = 'run'
  const mockInteract = {
    run: async () => ({ value: mockPassword })
  }

  const restoreTerminal = Helper.override('..', { Interact: () => mockInteract })
  t.teardown(restoreTerminal)

  await permit(mockIpc, mockInfo, mockCmd)
  t.ok(output.includes(`${ansi.tick} Added encryption key for pear://${hypercoreid.encode(mockKey)}`), 'permit should print encryption confirmation message')

  const exitedRes = await exited
  t.is(exitedRes, true, 'Pear.exit ok')
})

test('Interact - autosubmit', testOptions, async function (t) {
  t.plan(3)

  const { teardown } = rig()
  t.teardown(teardown)

  let readlineCalled = false
  const mockCreateInterface = () => ({
    _prompt: '',
    once: (event, callback) => { readlineCalled = true; callback(Buffer.from('')) },
    on: () => {},
    input: { setMode: () => {} },
    close: () => {}
  })
  const restoreReadLine = Helper.override('bare-readline', { createInterface: mockCreateInterface })
  t.teardown(restoreReadLine)

  const { Interact } = require('..')
  t.teardown(() => { Helper.forget('..') })

  const mockCmd = 'run'

  const interact = new Interact(mockCmd, [
    { name: 'username', default: 'defaultuser', shave: [0] },
    { name: 'password', default: 'defaultpass', secret: true }
  ])

  const { fields } = await interact.run({ autosubmit: true })
  t.is(readlineCalled, false, 'should not call readline when doing autosubmit')
  t.is(fields.username, 'defaultuser', 'should use default value for username')
  t.is(fields.password, 'defaultpass', 'should use default value for password')
})

test('outputter - JSON mode', testOptions, async function (t) {
  t.plan(1)

  const { teardown } = rig()
  t.teardown(teardown)

  const { outputter } = require('..')
  t.teardown(() => { Helper.forget('..') })

  const mockData = [{ tag: 'test', data: 'Test output' }]

  let capturedOutput = ''
  const originalConsoleLog = console.log
  console.log = (msg) => { capturedOutput += msg }
  t.teardown(() => { console.log = originalConsoleLog })

  const outputterFn = outputter('test-cmd')
  await outputterFn({ json: true }, mockData)

  t.ok(capturedOutput.includes('"data":"Test output"'), 'should print JSON when in JSON mode')
})

test('outputter - JSON mode - with log', testOptions, async function (t) {
  t.plan(3)

  const { teardown } = rig()
  t.teardown(teardown)

  const { outputter } = require('..')
  t.teardown(() => { Helper.forget('..') })

  const mockData = [{ tag: 'test', data: 'Test output' }]

  let capturedOutput = ''
  const originalConsoleLog = console.log
  console.log = (msg) => { capturedOutput += msg }
  t.teardown(() => { console.log = originalConsoleLog })

  const logOutput = []
  const log = (msg) => { logOutput.push(msg) }

  const outputterFn = outputter('test-cmd')
  await outputterFn({ json: true, log }, mockData)

  t.is(capturedOutput, '', 'should not print to console')
  t.ok(logOutput.length > 0, 'should use log function when provided in json mode')
  t.ok(logOutput[0].includes('"data":"Test output"'), 'should contain JSON output in log')
})

test('outputter - non-JSON mode', testOptions, async function (t) {
  t.plan(6)

  const { teardown } = rig()
  t.teardown(teardown)

  let statusOutput = ''
  const restoreTTY = Helper.override('bare-tty', {
    isTTY: () => true,
    WriteStream: class { write = (str) => { statusOutput += str } },
    ReadStream: class extends Readable { setMode = () => {} }
  })
  t.teardown(restoreTTY)

  const { outputter } = require('..')
  t.teardown(() => { Helper.forget('..') })

  let capturedOutput = ''
  const originalConsoleLog = console.log
  console.log = (msg) => { capturedOutput += msg }
  t.teardown(() => { console.log = originalConsoleLog })

  const testData = [
    { tag: 'info', data: 'Processing files...' },
    { tag: 'status', data: 'Loading...' },
    { tag: 'message', data: 'Hello World' },
    { tag: 'final', data: { success: true } },
    { tag: 'invalid', data: {} },
    { tag: 'result', data: { success: true, message: 'Operation completed' } }
  ]

  const taggers = {
    info: (data) => ({ output: 'print', message: data }),
    status: (data) => ({ output: 'status', message: data }),
    message: (data) => `Received: ${data}`,
    result: (data) => ({ output: 'print', message: data.message, success: data.success })
  }

  const outputterFn = outputter('test-cmd', taggers)
  await outputterFn({ json: false }, testData)

  t.ok(capturedOutput.includes('Processing files...'), 'should use taggers')
  t.ok(statusOutput.includes('Loading...'), 'should use taggers for status messages')
  t.ok(capturedOutput.includes('Received: Hello World'), 'should use taggers for transform message tag')
  t.ok(capturedOutput.includes('Success'), 'should handle final tag with success message')
  t.ok(!capturedOutput.includes('invalid'), 'should ignore invalid tags')
  t.ok(capturedOutput.includes('Operation completed'), 'should handle success result')
})

test('outputter - non-JSON mode - with log', testOptions, async function (t) {
  t.plan(8)

  const { teardown } = rig()
  t.teardown(teardown)

  let statusOutput = ''
  const restoreTTY = Helper.override('bare-tty', {
    isTTY: () => true,
    WriteStream: class { write = (str) => { statusOutput += str } },
    ReadStream: class extends Readable { setMode = () => {} }
  })
  t.teardown(restoreTTY)

  const { outputter } = require('..')
  t.teardown(() => { Helper.forget('..') })

  let capturedOutput = ''
  const originalConsoleLog = console.log
  console.log = (msg) => { capturedOutput += msg }
  t.teardown(() => { console.log = originalConsoleLog })

  const testData = [
    { tag: 'info', data: 'Processing files...' },
    { tag: 'status', data: 'Loading...' },
    { tag: 'message', data: 'Hello World' },
    { tag: 'final', data: { success: true } },
    { tag: 'invalid', data: {} },
    { tag: 'result', data: { success: true, message: 'Operation completed' } }
  ]

  const taggers = {
    info: (data) => ({ output: 'print', message: data }),
    status: (data) => ({ output: 'status', message: data }),
    message: (data) => `Received: ${data}`,
    result: (data) => ({ output: 'print', message: data.message, success: data.success })
  }

  let logOutput = ''
  const log = (msg) => { logOutput += msg }

  const outputterFn = outputter('test-cmd', taggers)
  await outputterFn({ json: false, log }, testData)

  t.is(statusOutput, '', 'should not print to console when log is specified')
  t.is(capturedOutput, '', 'should not print using console.log when log is specified')
  t.ok(logOutput.includes('Processing files...'), 'should use log for messages')
  t.ok(logOutput.includes('Loading...'), 'should use log for status message')
  t.ok(logOutput.includes('Received: Hello World'), 'should use log for message tag')
  t.ok(logOutput.includes('Success'), 'should use log for final tag')
  t.ok(!logOutput.includes('invalid'), 'should ignore invalid tags')
  t.ok(logOutput.includes('Operation completed'), 'should handle success result')
})
