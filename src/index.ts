import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'
import 'dotenv/config'
import readline from 'node:readline/promises'
import figlet from 'figlet'


const myApiKey = process.env.AI_GATEWAY_API_KEY

const client = new Anthropic({
  apiKey: myApiKey,
  baseURL: 'https://ai-gateway.vercel.sh',
})

const workDir = process.cwd()
const model = 'claude-sonnet-4-6'
const max_tokens = 16000
const system = 'You help the user run Tidy3D simulations of SiC nanobeam cavities.'

const tools: Anthropic.Tool[] = [
  {
    name: 'getFlexCredit',
    description: 'Tidy3D FlexCredit balance and its expiration date',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'getAllowance',
    description: 'Free monthly Tidy3D allowance left and when it refreshes',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
]

// Tools run in Python behind the server that is already running (src/server.ts)
async function runTool(name: string, args: Record<string, unknown>) {
  // axios.post(url, body, config). validateStatus: () => true treats every status as success,
  // so a failed tool (500 + {error}) goes back to Claude instead of throwing.
  // It still throws if the server gives no response at all (e.g. not running).
  const res = await axios.post(`http://localhost:3001/tool/${name}`,
    args,
    { validateStatus: () => true }
  )
  return res.data
}


async function agentLoop(messages: Anthropic.MessageParam[]) {
  let response = await client.messages.create({
    model,
    max_tokens,
    tools,
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    messages,
    system,
  })

  // Loop until Claude stops asking for tools. Each iteration runs the requested
  // tool, appends the result to history, and asks Claude to continue.
  while (response.stop_reason === 'tool_use') {

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )!


    console.log(`Claude (${new Date().toISOString()}) >> running the tool: ` + toolUse.name)
    const result = await runTool(toolUse.name, toolUse.input as Record<string, unknown>)

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        },
      ],
    });

    response = await client.messages.create({
      model,
      max_tokens,
      tools,
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      messages,
      system,
    })
  }

  // Claude stopped calling tools: save its final turn and print the text.
  messages.push({ role: 'assistant', content: response.content })
  for (const block of response.content) {
    if (block.type === 'text') {
      console.log(`Claude (${new Date().toISOString()}) >> ` + block.text)
    }
  }
}


async function main() {
  const msgHistory: Anthropic.MessageParam[] = []
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log(
    await figlet.text('TrustcavityX', {
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 120,
      whitespaceBreak: true,
    })
  )

  while (true) {
    const input = await rl.question(`You (${new Date().toISOString()}) >> `)
    if (['q', 'exit', ''].includes(input.trim().toLowerCase())) {
      break
    }
    msgHistory.push({ role: 'user', content: input })
    await agentLoop(msgHistory).catch((e) => console.error(String(e)))
  }

  rl.close()
}

main()
