'use strict'
/* global Bare */

const { test } = require('brittle')
const hypercoreid = require('hypercore-id-encoding')
const { isBare } = require('which-runtime')
const Helper = require('./helper')

const testOptions = { skip: !isBare }

global.Pear = null

test('confirm function with valid input', testOptions, async function (t) {
  t.plan(1)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const restoreReadLine = Helper.stubReadlineInput('YES\n')
  t.teardown(restoreReadLine)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { ansi, confirm } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const dialog = `${ansi.warning} Are you sure you want to proceed?`
  const ask = 'Type YES to confirm'
  const delim = ':'
  const validation = (value) => value === 'YES'
  const msg = 'Invalid input. Please type YES to confirm.'

  await confirm(dialog, ask, delim, validation, msg)
  t.ok(tty.output.includes('YES'), 'confirm should accept valid input')
})

test('confirm function with invalid input', testOptions, async function (t) {
  t.plan(1)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const restoreReadLine = Helper.stubReadlineInput('NO\n')
  t.teardown(restoreReadLine)

  const tty = Helper.stubTTY({
    onWrite: (str) => {
      if (str.includes('Invalid input')) throw Error('Invalid input')
    }
  })
  t.teardown(tty.restore)

  const { ansi, confirm } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const dialog = `${ansi.warning} Are you sure you want to proceed?`
  const ask = 'Type YES to confirm'
  const delim = ':'
  const validation = (value) => value === 'YES'
  const msg = 'Invalid input. Please type YES to confirm.'

  try {
    await confirm(dialog, ask, delim, validation, msg)
  } catch {
    t.ok(tty.output.includes('Invalid input'), 'confirm should reject invalid input')
  }
})

test('permit function with unencrypted key', testOptions, async function (t) {
  t.plan(4)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const restoreReadLine = Helper.stubReadlineInput('TRUST\n')
  t.teardown(restoreReadLine)

  const { ansi, permit } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const exitCapture = Helper.captureExit()
  t.teardown(exitCapture.restore)

  const consoleCapture = Helper.captureConsole()
  t.teardown(consoleCapture.restore)

  const mockKey = hypercoreid.decode(
    'd47c1dfecec0f74a067985d2f8d7d9ad15f9ae5ff648f7bc6ca28e41d70ed221'
  )
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
  t.ok(
    consoleCapture.output.includes(
      `${ansi.tick} pear://${hypercoreid.encode(mockKey)} is now trusted`
    ),
    'permit should print trust confirmation message'
  )

  const exitedRes = await exitCapture.exited
  t.is(exitedRes, true, 'Pear.exit ok')
})

test('permit function with encrypted key', testOptions, async function (t) {
  t.plan(5)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const mockPassword = 'MYPASSWORD'

  const restoreReadLine = Helper.stubReadlineInput(`${mockPassword}\n`)
  t.teardown(restoreReadLine)

  const { ansi, permit } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const exitCapture = Helper.captureExit()
  t.teardown(exitCapture.restore)

  const consoleCapture = Helper.captureConsole()
  t.teardown(consoleCapture.restore)

  const mockKey = hypercoreid.decode(
    'd47c1dfecec0f74a067985d2f8d7d9ad15f9ae5ff648f7bc6ca28e41d70ed221'
  )
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

  await permit(mockIpc, mockInfo, mockCmd)
  t.ok(
    consoleCapture.output.includes(
      `${ansi.tick} Added encryption key for pear://${hypercoreid.encode(mockKey)}`
    ),
    'permit should print encryption confirmation message'
  )

  const exitedRes = await exitCapture.exited
  t.is(exitedRes, true, 'Pear.exit ok')
})

// TODO: align autosubmit
test.skip('Interact - autosubmit', testOptions, async function (t) {
  t.plan(3)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  let readlineCalled = false
  const restoreReadLine = Helper.stubReadline(() => ({
    _prompt: '',
    once: (event, callback) => {
      readlineCalled = true
      callback(Buffer.from(''))
    },
    on: () => {},
    input: { setMode: () => {} },
    close: () => {}
  }))
  t.teardown(restoreReadLine)

  const { Interact } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

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

test('Interact - input shows dimmed default placeholder', testOptions, async function (t) {
  t.plan(3)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  let output = ''
  let outputAfterType = ''
  let captureAfterType = false
  let rlInstance = null
  const restoreReadLine = Helper.stubReadline(() => {
    rlInstance = {
      _prompt: '',
      _line: '',
      _cursor: 0,
      _columns: 80,
      _previousRows: 0,
      write: (str) => {
        output += str
        if (captureAfterType) outputAfterType += str
      },
      setPrompt: function (prompt) {
        this._prompt = prompt
      },
      prompt: function () {},
      once: (event, callback) => {
        if (event === 'data') setTimeout(() => callback(Buffer.from('typed\n')), 10)
      },
      on: () => {},
      off: () => {},
      input: { setMode: () => {} },
      close: () => {}
    }
    return rlInstance
  })
  t.teardown(restoreReadLine)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { Interact, ansi } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const interact = new Interact('', [
    { name: 'app', prompt: 'Name', delim: ':', default: 'my-app' }
  ])

  await new Promise((resolve, reject) => {
    const stream = interact.run()
    stream.on('data', () => {})
    stream.on('end', resolve)
    stream.on('error', reject)
    setTimeout(() => {
      if (!rlInstance) return
      rlInstance._line = 'x'
      rlInstance._cursor = 1
      captureAfterType = true
      rlInstance.prompt()
    }, 5)
  })

  t.ok(output.includes('Name: '), 'should print the prompt')
  t.ok(output.includes(ansi.dim('(my-app)')), 'should render dimmed default placeholder')
  t.ok(!outputAfterType.includes(ansi.dim('(my-app)')), 'should hide placeholder after typing')
})
