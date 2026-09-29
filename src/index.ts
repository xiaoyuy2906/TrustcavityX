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
const system = 'You help the user design 1D photonic crystal nanobeam cavities with Tidy3D simulations. ' +
  'runTask spends FlexCredits: before calling it, tell the user the max cost from estimateUnitCell and wait for their OK.'

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
  {
    name: 'estimateUnitCell',
    description: 'Build a 1D nanobeam unit cell (one hole per period, Bloch kx = pi/a), upload it to Tidy3D, ' +
      'and return its task_id and max FlexCredit cost. Free: nothing runs yet. All lengths in um.',
    input_schema: {
      type: 'object',
      properties: {
        n: { type: 'number', description: 'refractive index of the beam material' },
        wavelength: { type: 'number', description: 'target wavelength (um)' },
        a: { type: 'number', description: 'lattice constant (um)' },
        w: { type: 'number', description: 'beam width (um)' },
        h: { type: 'number', description: 'beam thickness (um)' },
        shape: { type: 'string', enum: ['circle', 'ellipse', 'rect'], description: 'hole shape; circle needs hole_x = hole_y' },
        hole_x: { type: 'number', description: 'full hole width along the beam (um)' },
        hole_y: { type: 'number', description: 'full hole width across the beam (um)' },
      },
      required: ['n', 'wavelength', 'a', 'w', 'h', 'shape', 'hole_x', 'hole_y']
    }
  },
  {
    name: 'runTask',
    description: 'Run an uploaded Tidy3D task and wait until it finishes. Spends FlexCredits.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id']
    }
  },
  {
    name: 'getUnitCellResult',
    description: 'Band edges of a finished unit cell task at kx = pi/a: TE0 (dielectric band) and TE1 (air band) wavelengths, ' +
      'mirror strength = min(f_TE1 - f0, f0 - f_TE0) / f0 (negative: target not in the gap), and every resonance found.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id']
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
