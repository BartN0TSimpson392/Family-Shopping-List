import { NextRequest } from 'next/server'

// In-memory store — survives warm serverless instances; acceptable for
// short-lived shopping sessions. Cold starts reset it (shopper gets a
// "not found" and the fallback ?list= URL still works).
const store = new Map<string, string>()

function makeId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  let id = makeId()
  while (store.has(id)) id = makeId()
  store.set(id, body)
  return Response.json({ id })
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.toUpperCase()
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })
  const data = store.get(id)
  if (!data) return Response.json({ error: 'not found' }, { status: 404 })
  return new Response(data, { headers: { 'Content-Type': 'application/json' } })
}
