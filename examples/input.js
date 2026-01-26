'use strict'

const opwait = require('pear-opwait')
const { Interact, print } = require('..')

async function main() {
  const fields = {}
  const interact = new Interact('Simple input example\n\n', [
    {
      name: 'name',
      prompt: 'Name',
      delim: ':',
      default: 'Anonymous'
    },
    {
      name: 'email',
      prompt: 'Email',
      delim: ':',
      validation: (value) => value?.includes('@'),
      msg: 'Please enter a valid email.\n'
    }
  ])

  await opwait(interact.run(), ({ tag, data }) => {
    if (tag === 'input') fields[data.name] = data.answer
  })

  print(`\nThanks, ${fields.name}!`)
}

main()
