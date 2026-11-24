import { createServer } from 'node:http'
import { request } from 'node:https'
import { performance } from 'node:perf_hooks'

const zonalUrl = 'https://mm.zonalconnect.com/Portal/login/Login'
const timeoutMs = 10_000

function testZonal() {
  const startedAt = performance.now()

  return new Promise((resolve) => {
    function finish(httpStatus, errorCode) {
      clearTimeout(timer)
      resolve({
        httpStatus,
        connected: httpStatus !== null,
        elapsedMs: Math.round(performance.now() - startedAt),
        errorCode,
      })
    }

    const probe = request(zonalUrl, { method: 'HEAD', agent: false }, (upstream) => {
      upstream.resume()
      finish(upstream.statusCode, null)
    })
    const timer = setTimeout(() => {
      finish(null, 'ETIMEDOUT')
      probe.destroy()
    }, timeoutMs)

    probe.once('error', (error) => finish(null, error.code ?? 'UNKNOWN'))
    probe.end()
  })
}

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end()
    return
  }

  if (req.method === 'GET' && req.url === '/test-zonal') {
    const result = await testZonal()
    const status = result.connected ? 200 : result.errorCode === 'ETIMEDOUT' ? 504 : 502
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    }).end(JSON.stringify(result))
    return
  }

  res.writeHead(404).end()
}).listen(Number(process.env.PORT || 10000), '0.0.0.0')
