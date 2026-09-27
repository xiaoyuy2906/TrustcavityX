# TrustcavityX

A Claude agent that designs 1D photonic crystal nanobeam cavities, using [Tidy3D](https://www.flexcompute.com/tidy3d/) FDTD simulations as its tools.

The design follows the deterministic approach of Quan & Lončar (2011): pick a mirror unit cell from its band edges at kx = π/a, shift the band edge onto the target frequency for the cavity center, then taper quadratically between the two.

## Architecture

```
Frontend ──POST /chat──▶ Express server ──▶ agent loop ◀──▶ Claude API
                                               │ tool_use    ▲ tool_result
                                               ▼             │
                                          callPython ────────┘
                                               │ spawn
                                               ▼
                                   py/run.py → py/tools.py (Tidy3D)
```

Python writes tool results to stdout and all logs to stderr; both are meant to reach the frontend.

For now a CLI (`src/index.ts`) stands in for the frontend and calls the server's `/tool/:name` route.

## Run

`.env` in the project root:

```
AI_GATEWAY_API_KEY=...   # Vercel AI Gateway
SIMCLOUD_APIKEY=...      # Tidy3D
```

```bash
pnpm install
cd py && uv sync && cd ..
pnpm server          # tool server on :3001
node src/index.ts    # chat with the agent
```

## Status

- [x] Node ↔ Python tool bridge
- [x] Account tools: FlexCredit balance, monthly allowance
- [x] CLI agent loop with tool use
- [ ] Unit cell tool: TE0 / TE1 band edges at kx = π/a and mirror strength *(in progress)*
- [ ] Separate cost estimate and run, with a FlexCredit check before every run
- [ ] Mirror cell search guided by the agent
- [ ] Cavity center period: tune the TE0 band edge onto the target frequency
- [ ] Quadratic taper and full-cavity 3D FDTD (resonance, Q, mode volume)
- [ ] Run records in SQLite
- [ ] Web frontend
