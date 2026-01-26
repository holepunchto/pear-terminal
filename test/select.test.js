'use strict'

const { test } = require('brittle')
const { isBare } = require('which-runtime')
const Helper = require('./helper')

const testOptions = { skip: !isBare }

global.Pear = null

// TODO: add select behavior coverage
test.skip('select - basic selection', testOptions, async function (t) {
  t.plan(1)

  const teardown = Helper.rigPearGlobal()
  t.teardown(teardown)

  t.pass('placeholder')
})
