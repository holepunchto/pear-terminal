'use strict'

const opwait = require('pear-opwait')
const { Interact, print } = require('..')

async function main() {
  const result = {}
  const interact = new Interact('Input + select example\n\n', [
    {
      name: 'project',
      prompt: 'Project name',
      delim: ':',
      default: 'my-app'
    },
    {
      name: 'template',
      prompt: 'Choose a template',
      hint: 'Use number keys. Return to submit.',
      select: [
        { prompt: 'Minimal', desc: 'Bare setup', params: { value: 'minimal' } },
        { prompt: 'Web', desc: 'Web starter kit', params: { value: 'web' } },
        { prompt: 'Desktop', desc: 'Native shell', params: { value: 'desktop' } }
      ]
    }
  ])

  await opwait(interact.run(), ({ tag, data }) => {
    if (tag === 'input') result[data.name] = data.answer
    if (tag === 'select') result[data.trail[0]] = data.answer
  })

  print(`\nProject: ${result.project}`)
  print(`Template: ${JSON.stringify(result.template)}`)
}

main()
