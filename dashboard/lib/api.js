const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

async function request(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  }
  if (body) options.body = JSON.stringify(body)

  const res = await fetch(`${BASE_URL}${path}`, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`)
  return data
}

export const api = {
  get:  (path)       => request('GET',  path),
  post: (path, body) => request('POST', path, body),
}
