'use strict'

const opwait = require('pear-opwait')
const { Interact, print } = require('..')

async function main() {
  const interact = new Interact('Select example\n\n', [
    {
      name: 'theme',
      prompt: 'Choose a theme',
      select: [
        { prompt: 'Minimal', params: { theme: 'minimal', border: false } },
        { prompt: 'Bold', params: { theme: 'bold', border: true } },
        { prompt: 'Neon', params: { theme: 'neon', border: true } }
      ]
    }
  ])

  let selection = null
  await opwait(interact.run(), ({ tag, data }) => {
    if (tag === 'select') {
      selection = { choice: data.name, value: data.answer }
    }
  })

  print(`\nSelected: ${selection.choice}`)
  print(`Config: ${JSON.stringify(selection.value)}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
