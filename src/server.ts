import express, { type Express, type Request, type Response } from 'express'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PY_DIR = path.resolve(__dirname, '../py')

/** Run one tool from py/tools.py. Same machine, so we start it and read its output. */
function callPython(tool: string, args: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const subProcess = spawn('uv', ['run', 'python', 'run.py'], { cwd: PY_DIR })
    let out = ''
    let err = ''
    subProcess.stdout.on('data', (d) => (out += d))
    subProcess.stderr.on('data', (d) => {
      err += d
      process.stderr.write(d)
    })
    subProcess.on('error', reject)
    subProcess.on('close', (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err))))
    subProcess.stdin.end(JSON.stringify({ tool, args }))
  })
}

const app: Express = express()
const port = 3001

app.use(express.json())


app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!')
})

app.post('/tool/:name', async (req, res) => {
  console.log(req.params.name)
  const args = req.body
  console.log(args)
  try {
    res.json({ result: await callPython(req.params.name, args) })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
})




// test spawn and python code
// fetch('/tool/add', {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify({ a: 1, b: 2 }),
// }).then(r => r.json()).then(console.log)
