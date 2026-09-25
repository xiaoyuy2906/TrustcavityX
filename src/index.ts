import Anthropic from '@anthropic-ai/sdk'
import 'dotenv/config'


const myApiKey = process.env.AI_GATEWAY_API_KEY

const client = new Anthropic({
  apiKey: myApiKey,
  baseURL: 'https://ai-gateway.vercel.sh',
})