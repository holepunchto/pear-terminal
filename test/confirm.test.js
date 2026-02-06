'use strict'

const { test } = require('brittle')
const { isBare } = require('which-runtime')
const Helper = require('./helper')

const testOptions = { skip: !isBare }

global.Pear = null

test('confirm - yes answer resolves to true', testOptions, async function (t) {
  t.plan(2)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const restoreReadLine = Helper.stubReadlineInput('yes\n')
  t.teardown(restoreReadLine)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { Interact } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const interact = new Interact('', [
    {
      name: 'proceed',
      prompt: 'Continue',
      boolean: true
    }
  ])

  let result = null
  await new Promise((resolve, reject) => {
    const stream = interact.run()
    stream.on('data', ({ tag, data }) => {
      if (tag === 'confirm') result = data
    })
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  t.is(result.name, 'proceed', 'should emit confirm tag with param name')
  t.is(result.answer, true, 'should resolve yes to true')
})

test('confirm - no answer resolves to false', testOptions, async function (t) {
  t.plan(1)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const restoreReadLine = Helper.stubReadlineInput('no\n')
  t.teardown(restoreReadLine)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { Interact } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const interact = new Interact('', [
    {
      name: 'proceed',
      prompt: 'Continue',
      boolean: true
    }
  ])

  let result = null
  await new Promise((resolve, reject) => {
    const stream = interact.run()
    stream.on('data', ({ tag, data }) => {
      if (tag === 'confirm') result = data
    })
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  t.is(result.answer, false, 'should resolve no to false')
})

test('confirm - y shorthand resolves to true', testOptions, async function (t) {
  t.plan(1)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const restoreReadLine = Helper.stubReadlineInput('y\n')
  t.teardown(restoreReadLine)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { Interact } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const interact = new Interact('', [
    {
      name: 'proceed',
      prompt: 'Continue',
      boolean: true
    }
  ])

  let result = null
  await new Promise((resolve, reject) => {
    const stream = interact.run()
    stream.on('data', ({ tag, data }) => {
      if (tag === 'confirm') result = data
    })
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  t.is(result.answer, true, 'should resolve y to true')
})

test('confirm - empty answer resolves to false', testOptions, async function (t) {
  t.plan(1)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const restoreReadLine = Helper.stubReadlineInput('\n')
  t.teardown(restoreReadLine)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { Interact } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const interact = new Interact('', [
    {
      name: 'proceed',
      prompt: 'Continue',
      boolean: true
    }
  ])

  let result = null
  await new Promise((resolve, reject) => {
    const stream = interact.run()
    stream.on('data', ({ tag, data }) => {
      if (tag === 'confirm') result = data
    })
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  t.is(result.answer, false, 'should resolve empty to false')
})

test('confirm - shows description and Yes/No hint', testOptions, async function (t) {
  t.plan(3)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const restoreReadLine = Helper.stubReadlineInput('yes\n')
  t.teardown(restoreReadLine)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { Interact, ansi } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const interact = new Interact('', [
    {
      name: 'deploy',
      prompt: 'Deploy to production',
      description: 'This cannot be undone',
      boolean: true
    }
  ])

  await new Promise((resolve, reject) => {
    const stream = interact.run()
    stream.on('data', () => {})
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  t.ok(tty.output.includes('Deploy to production'), 'should print the question')
  t.ok(tty.output.includes(ansi.dim('  - This cannot be undone')), 'should print the description')
  t.ok(tty.output.includes(ansi.dim('(Yes/No)')), 'should print Yes/No hint')
})
