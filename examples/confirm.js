'use strict'

const opwait = require('pear-opwait')
const { Interact, print } = require('..')

async function main() {
  const result = {}
  const interact = new Interact('Confirm example\n\n', [
    {
      name: 'proceed',
      prompt: 'Continue with deployment',
      description: 'This will push to production',
      boolean: true,
      default: false
    }
  ])

  await opwait(interact.run(), ({ tag, data }) => {
    if (tag === 'confirm') result[data.name] = data.answer
  })

  print(`\nProceed: ${result.proceed}`)
}

main()
