'use strict'

const { test } = require('brittle')
const { isBare } = require('which-runtime')
const Helper = require('./helper')

const testOptions = { skip: !isBare }

global.Pear = null

test('indicator function', testOptions, async function (t) {
  t.plan(6)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const { indicator, ansi } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  t.is(indicator(true), ansi.tick + ' ', 'indicator should return tick for true')
  t.is(indicator(false), ansi.cross + ' ', 'indicator should return cross for false')
  t.is(indicator(null), ansi.gray('- '), 'indicator should return gray dash for null')
  t.is(indicator(1), ansi.tick + ' ', 'indicator should return tick for positive number')
  t.is(indicator(-1), ansi.cross + ' ', 'indicator should return cross for negative number')
  t.is(indicator(0), ansi.gray('- '), 'indicator should return gray dash for zero')
})

test('status function', testOptions, async function (t) {
  t.plan(3)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { status, ansi } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  status('Test message', true)
  t.ok(
    tty.output.includes(ansi.tick + ' Test message'),
    'status should print success message correctly'
  )

  tty.clear()
  status('Test message', false)
  t.ok(
    tty.output.includes(ansi.cross + ' Test message'),
    'status should print failure message correctly'
  )

  tty.clear()
  status('Test message')
  t.ok(tty.output.includes('Test message'), 'status should print message without success indicator')
})

test('print function', testOptions, async function (t) {
  t.plan(3)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const { print, ansi } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const consoleCapture = Helper.captureConsole()
  t.teardown(consoleCapture.restore)

  print('Test message', true)
  t.ok(
    consoleCapture.output.includes(ansi.tick + ' Test message'),
    'print should print success message correctly'
  )

  consoleCapture.clear()
  print('Test message', false)
  t.ok(
    consoleCapture.output.includes(ansi.cross + ' Test message'),
    'print should print failure message correctly'
  )

  consoleCapture.clear()
  print('Test message')
  t.ok(
    consoleCapture.output.includes('Test message'),
    'print should print message without success indicator'
  )
})

test('outputter - JSON mode', testOptions, async function (t) {
  t.plan(1)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const { outputter } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const mockData = [{ tag: 'test', data: 'Test output' }]

  const consoleCapture = Helper.captureConsole()
  t.teardown(consoleCapture.restore)

  const outputterFn = outputter('test-cmd')
  await outputterFn({ json: true }, mockData)

  t.ok(
    consoleCapture.output.includes('"data":"Test output"'),
    'should print JSON when in JSON mode'
  )
})

test('outputter - JSON mode - with log', testOptions, async function (t) {
  t.plan(3)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const { outputter } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const mockData = [{ tag: 'test', data: 'Test output' }]

  const consoleCapture = Helper.captureConsole()
  t.teardown(consoleCapture.restore)

  const logOutput = []
  const log = (msg) => {
    logOutput.push(msg)
  }

  const outputterFn = outputter('test-cmd')
  await outputterFn({ json: true, log }, mockData)

  t.is(consoleCapture.output, '', 'should not print to console')
  t.ok(logOutput.length > 0, 'should use log function when provided in json mode')
  t.ok(logOutput[0].includes('"data":"Test output"'), 'should contain JSON output in log')
})

test('outputter - non-JSON mode', testOptions, async function (t) {
  t.plan(7)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { outputter } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const consoleCapture = Helper.captureConsole()
  t.teardown(consoleCapture.restore)

  const testData = [
    { tag: 'info', data: 'Processing files...' },
    { tag: 'arr', data: 'Array' },
    { tag: 'status', data: 'Loading...' },
    { tag: 'message', data: 'Hello World' },
    { tag: 'final', data: { success: true } },
    { tag: 'invalid', data: {} },
    { tag: 'result', data: { success: true, message: 'Operation completed' } }
  ]

  const taggers = {
    info: (data) => ({ output: 'print', message: data }),
    arr: (data) => ({ output: 'print', message: ['a', 'b', 'c', data] }),
    status: (data) => ({ output: 'status', message: data }),
    message: (data) => `Received: ${data}`,
    result: (data) => ({
      output: 'print',
      message: data.message,
      success: data.success
    })
  }

  const outputterFn = outputter('test-cmd', taggers)
  await outputterFn({ json: false }, testData)

  t.ok(consoleCapture.output.includes('Processing files...'), 'should output normal messages')
  t.ok(consoleCapture.output.includes('a\nb\nc\nArray'), 'should handle array message correctly')
  t.ok(tty.output.includes('Loading...'), 'should output status messages')
  t.ok(consoleCapture.output.includes('Received: Hello World'), 'should transform message')
  t.ok(consoleCapture.output.includes('Success'), 'should handle final tag with success message')
  t.ok(!consoleCapture.output.includes('invalid'), 'should ignore invalid tags')
  t.ok(consoleCapture.output.includes('Operation completed'), 'should handle success result')
})

test('outputter - non-JSON mode - with log', testOptions, async function (t) {
  t.plan(9)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { outputter, ansi } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const consoleCapture = Helper.captureConsole()
  t.teardown(consoleCapture.restore)

  const testData = [
    { tag: 'info', data: 'Processing files...' },
    { tag: 'arr', data: 'Array' },
    { tag: 'status', data: 'Loading...' },
    { tag: 'message', data: 'Hello World' },
    { tag: 'final', data: { success: true } },
    { tag: 'invalid', data: {} },
    { tag: 'result', data: { success: true, message: 'Operation completed' } }
  ]

  const taggers = {
    info: (data) => ({ output: 'print', message: data }),
    arr: (data) => ({ output: 'print', message: ['a', 'b', 'c', data] }),
    status: (data) => ({ output: 'status', message: data }),
    message: (data) => `Received: ${data}`,
    result: (data) => ({
      output: 'print',
      message: data.message,
      success: data.success
    })
  }

  let logOutput = ''
  const log = (msg) => {
    logOutput += msg + '\n'
  }

  const outputterFn = outputter('test-cmd', taggers)
  await outputterFn({ json: false, log }, testData)

  t.is(
    tty.output.replace(ansi.hideCursor(), '').replace(ansi.showCursor(), ''),
    '',
    'should not print any text output to tty'
  )
  t.is(consoleCapture.output, '', 'should not print using console.log when log is specified')
  t.ok(logOutput.includes('Processing files...'), 'should use log for normal messages')
  t.ok(logOutput.includes('a\nb\nc\nArray'), 'should handle array message correctly')
  t.ok(logOutput.includes('Loading...'), 'should use log for status message')
  t.ok(logOutput.includes('Received: Hello World'), 'should use log for transformed messages')
  t.ok(logOutput.includes('Success'), 'should use log for final tag')
  t.ok(!logOutput.includes('invalid'), 'should ignore invalid tags')
  t.ok(logOutput.includes('Operation completed'), 'should handle success result')
})

test('byteDiff function', testOptions, async function (t) {
  t.plan(3)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const consoleCapture = Helper.captureConsole()
  t.teardown(consoleCapture.restore)

  const { byteDiff } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  consoleCapture.clear()
  byteDiff({ type: 1, sizes: [1024, 2048], message: 'Files added' })
  t.ok(
    consoleCapture.output.includes('Files added') && consoleCapture.output.includes('(+1kB, +2kB)'),
    'should support added files'
  )

  consoleCapture.clear()
  byteDiff({ type: -1, sizes: [-512, -1024], message: 'Files removed' })
  t.ok(
    consoleCapture.output.includes('Files removed') &&
      consoleCapture.output.includes('(-512B, -1kB)'),
    'should support removed files'
  )

  consoleCapture.clear()
  byteDiff({ type: 0, sizes: [1024, -512, 0], message: 'Files changed' })
  t.ok(
    consoleCapture.output.includes('Files changed') &&
      consoleCapture.output.includes('(+1kB, -512B, 0B)'),
    'should support changed files'
  )
})
