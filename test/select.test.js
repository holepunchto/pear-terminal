'use strict'

const { test } = require('brittle')
const { isBare } = require('which-runtime')
const Helper = require('./helper')

const testOptions = { skip: !isBare }

global.Pear = null

test('select - prompts with hints and numbered options', testOptions, async function (t) {
  t.plan(5)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const restoreReadLine = Helper.stubReadlineInput('1\n')
  t.teardown(restoreReadLine)

  const tty = Helper.stubTTY()
  t.teardown(tty.restore)

  const { Interact, ansi } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const interact = new Interact('', [
    {
      name: 'theme',
      prompt: 'Choose a theme',
      hint: 'Use number keys. Return to submit.',
      select: [
        { prompt: 'Minimal', desc: 'No borders', params: { value: 'minimal' } },
        { prompt: 'Bold', desc: 'Strong contrast', params: { value: 'bold' } },
        { prompt: 'Neon', params: { value: 'neon' } }
      ]
    }
  ])

  await new Promise((resolve, reject) => {
    const stream = interact.run()
    stream.on('data', () => {})
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  t.ok(tty.output.includes(`${ansi.yellow('?')} Choose a theme`), 'should print the select prompt')
  t.ok(
    tty.output.includes(ansi.dim('  - Use number keys. Return to submit.')),
    'should print the select hint'
  )
  t.ok(tty.output.includes(`${ansi.dim('0)')} Minimal`), 'should print default option')
  t.ok(tty.output.includes(ansi.dim(' (default)')), 'should print default tag')
  t.ok(tty.output.includes(`${ansi.dim('1)')} Bold`), 'should print numbered options')
})

test('select - requires params', testOptions, async function (t) {
  t.plan(1)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  const restoreReadLine = Helper.stubReadlineInput('0\n')
  t.teardown(restoreReadLine)

  const { Interact } = require('..')
  t.teardown(() => {
    Helper.forget('..')
  })

  const interact = new Interact('', [
    {
      name: 'theme',
      prompt: 'Choose a theme',
      select: [{ prompt: 'Minimal' }]
    }
  ])

  await new Promise((resolve, reject) => {
    const stream = interact.run()
    stream.on('data', () => {})
    stream.on('end', () => reject(new Error('unexpected end')))
    stream.on('error', (err) => {
      t.ok(err.message.includes('missing params'), 'should reject missing params')
      resolve()
    })
  })
})
