'use strict'

const http   = require('http')
const { spawn, exec } = require('child_process')
const path   = require('path')
const fs     = require('fs')
const os     = require('os')

const ROOT       = path.resolve(__dirname, '..')
const PORT       = 3900
const MAX_LOGS   = 400
const PG_SERVICE = 'postgresql-x64-17'   // PostgreSQL 서비스명 (sc query 기준)

// ── State ──────────────────────────────────────────────────────────────────────

const state = {
  backend:  { proc: null, status: 'stopped', logs: [] },
  frontend: { proc: null, status: 'stopped', logs: [] },
  postgres: { status: 'unknown' },
}

const logClients    = { backend: new Set(), frontend: new Set() }
const statusClients = new Set()

const SERVERS = {
  backend: {
    label:     '백엔드',
    cwd:       path.join(ROOT, 'backend'),
    cmd:       'npm',
    args:      ['run', 'dev'],
    port:      4000,
    nodeOpts:  '--max-old-space-size=256',
    ready:     /listening|started|Server running|\[Server\]/i,
  },
  frontend: {
    label:     '프론트엔드',
    cwd:       path.join(ROOT, 'frontend'),
    cmd:       'npm',
    args:      ['run', 'dev'],
    port:      3000,
    nodeOpts:  '--max-old-space-size=768',
    ready:     /ready started|Local:/i,
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const stripAnsi = s => s.replace(/\x1b\[[\d;]*[mGKHFABCDJKsu]/g, '').replace(/\r/g, '')

function addLog(name, line, type = 'out') {
  const text = stripAnsi(line).trimEnd()
  if (!text) return
  const entry = { t: Date.now(), line: text, type }
  state[name].logs.push(entry)
  if (state[name].logs.length > MAX_LOGS) state[name].logs.shift()
  const payload = `data: ${JSON.stringify(entry)}\n\n`
  for (const res of logClients[name]) {
    try { res.write(payload) } catch { logClients[name].delete(res) }
  }
}

function broadcastStatus() {
  const payload = `data: ${JSON.stringify(getStatusSnapshot())}\n\n`
  for (const res of statusClients) {
    try { res.write(payload) } catch { statusClients.delete(res) }
  }
}

function setStatus(name, status) {
  state[name].status = status
  broadcastStatus()
}

function getStatusSnapshot() {
  return {
    backend:  { status: state.backend.status },
    frontend: { status: state.frontend.status },
    postgres: { status: state.postgres.status },
  }
}

// ── Next.js cache 자동 복구 ────────────────────────────────────────────────────

function fixNextCache() {
  const cfg = path.join(ROOT, 'frontend', '.next', 'dev', 'cache', 'next-devtools-config.json')
  try {
    if (fs.existsSync(cfg) && !fs.readFileSync(cfg, 'utf-8').includes('}')) {
      fs.writeFileSync(cfg, '{"theme":"light"}', 'utf-8')
      addLog('frontend', '⚙  Next.js 캐시 파일 복구 완료', 'sys')
    }
  } catch {}
}

// ── PostgreSQL ─────────────────────────────────────────────────────────────────

function checkPostgres() {
  exec(`sc query ${PG_SERVICE}`, (err, stdout) => {
    const prev = state.postgres.status
    const next = (stdout || '').includes('RUNNING') ? 'running' : 'stopped'
    state.postgres.status = next
    if (prev !== next) broadcastStatus()
  })
}

function startPostgres(cb) {
  exec(`net start ${PG_SERVICE}`, (err, stdout, stderr) => {
    const msg = err ? `오류: ${(stderr || err.message).trim()}` : `PostgreSQL 서비스 시작됨`
    checkPostgres()
    if (cb) cb(msg, !!err)
  })
}

// 이전 세션 잔여 워커 정리 (시작 시 1회)
cleanupAtStartup()

// PostgreSQL 상태를 5초마다 폴링
checkPostgres()
setInterval(checkPostgres, 5000)

// ── Process management ─────────────────────────────────────────────────────────

function startServer(name) {
  const s   = state[name]
  if (s.proc) return
  const cfg = SERVERS[name]

  if (name === 'frontend') fixNextCache()

  setStatus(name, 'starting')
  addLog(name, `▶  ${cfg.label} 시작 중... (npm run dev)`, 'sys')

  const cmdStr = `chcp 65001 >nul 2>&1 & ${cfg.cmd} ${cfg.args.join(' ')}`
  const proc = spawn(cmdStr, [], {
    cwd:  cfg.cwd,
    shell: true,
    windowsHide: true,            // CMD 창 완전히 숨김
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR:    '1',
      NODE_OPTIONS: cfg.nodeOpts,
    },
  })
  s.proc = proc

  const pipe = (chunk, streamType) => {
    chunk.toString().split('\n').forEach(line => {
      if (!line.trim()) return
      addLog(name, line, streamType)
      if (s.status === 'starting' && cfg.ready.test(line)) {
        setStatus(name, 'running')
        addLog(name, `✓  ${cfg.label} 준비 완료  :${cfg.port}`, 'sys')
      }
    })
  }

  proc.stdout.on('data', d => pipe(d, 'out'))
  proc.stderr.on('data', d => pipe(d, 'err'))

  proc.on('close', code => {
    s.proc = null
    setStatus(name, 'stopped')
    addLog(name, `■  프로세스 종료 (코드 ${code ?? '?'})`, 'sys')
  })
  proc.on('error', err => {
    s.proc = null
    setStatus(name, 'error')
    addLog(name, `✗  오류: ${err.message}`, 'err')
  })
}

// PS1 파일로 실행 — CMD 따옴표 이스케이프 문제 완전 회피
function runPS1(script, cb) {
  const tmp = path.join(os.tmpdir(), `mgr-kill-${Date.now()}.ps1`)
  fs.writeFileSync(tmp, script, 'utf8')
  exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmp}"`, () => {
    try { fs.unlinkSync(tmp) } catch {}
    if (cb) cb()
  })
}

function killEscapedWorkers(name, cb) {
  const pattern = name === 'frontend' ? '.next' : 'ts-node'
  runPS1(
    `Get-CimInstance Win32_Process |
       Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*${pattern}*' } |
       ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    cb
  )
}

// 서버 매니저 시작 시 이전 세션 잔여 워커 전체 정리
function cleanupAtStartup() {
  const myPid = process.pid
  runPS1(
    `$myPid = ${myPid}
     Get-CimInstance Win32_Process |
       Where-Object {
         $_.Name -eq 'node.exe' -and $_.ProcessId -ne $myPid -and
         ($_.CommandLine -like '*.next*' -or $_.CommandLine -like '*ts-node*')
       } |
       ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  )
}

// 프론트엔드 실행 중 Turbopack 좀비 워커를 주기적으로 정리
// Windows는 부모 프로세스 종료 시 자식이 자동으로 죽지 않아 워커가 무한 누적됨
function killStaleWorkers() {
  // N분 이상 된 .next 워커만 제거 — 현재 컴파일 중인 신선한 워커는 보존
  const STALE_MINUTES = 3
  runPS1(
    `$cutoff = (Get-Date).AddMinutes(-${STALE_MINUTES})
     Get-CimInstance Win32_Process |
       Where-Object {
         $_.Name -eq 'node.exe' -and
         $_.CommandLine -like '*\\.next\\dev\\build\\*' -and
         $_.CreationDate -lt $cutoff
       } |
       ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  )
}

// 프론트엔드가 running 상태일 때만 2분마다 정리
setInterval(() => {
  if (state.frontend.status === 'running') killStaleWorkers()
}, 2 * 60 * 1000)

function stopServer(name, onStopped) {
  const s = state[name]
  if (!s.proc && s.status !== 'starting') {
    if (onStopped) onStopped()
    return
  }
  const pid = s.proc?.pid
  s.proc = null
  setStatus(name, 'stopping')
  if (pid) {
    addLog(name, `□  종료 중... (PID ${pid})`, 'sys')
    exec(`taskkill /pid ${pid} /t /f`, () => {})
  }
  // 워커 정리 완료 후 onStopped 콜백 호출 (2.5초 충분히 대기)
  killEscapedWorkers(name, () => {
    setTimeout(() => {
      if (onStopped) onStopped()
    }, 1500)
  })
}

function restartServer(name) {
  stopServer(name, () => {
    addLog(name, `↺  재시작 준비 완료, 기동 중...`, 'sys')
    startServer(name)
  })
}

// ── HTTP server ────────────────────────────────────────────────────────────────

const UI_HTML = path.join(__dirname, 'ui.html')

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const p   = url.pathname
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // UI
  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(fs.readFileSync(UI_HTML))
    return
  }

  // Status SSE
  if (p === '/status/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write(`data: ${JSON.stringify(getStatusSnapshot())}\n\n`)
    statusClients.add(res)
    req.on('close', () => statusClients.delete(res))
    return
  }

  // Log SSE
  const logM = p.match(/^\/logs\/(backend|frontend)$/)
  if (logM) {
    const name = logM[1]
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    for (const e of state[name].logs) res.write(`data: ${JSON.stringify(e)}\n\n`)
    logClients[name].add(res)
    req.on('close', () => logClients[name].delete(res))
    return
  }

  // POST actions
  if (req.method === 'POST') {
    const body = []
    req.on('data', d => body.push(d))
    req.on('end', () => {
      const json = (() => { try { return JSON.parse(Buffer.concat(body)) } catch { return {} } })()

      if (p === '/action') {
        const { server: name, action } = json
        if (!SERVERS[name]) { res.writeHead(400); res.end(); return }
        if (action === 'start')   startServer(name)
        if (action === 'stop')    stopServer(name)
        if (action === 'restart') restartServer(name)
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
        return
      }

      if (p === '/postgres/start') {
        startPostgres((msg, isErr) => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: !isErr, msg }))
        })
        return
      }

      const clearM = p.match(/^\/logs\/(backend|frontend)\/clear$/)
      if (clearM) {
        state[clearM[1]].logs = []
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
        return
      }

      if (p === '/shutdown') {
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
        stopServer('backend'); stopServer('frontend')
        setTimeout(() => process.exit(0), 2500)
        return
      }

      res.writeHead(404); res.end()
    })
    return
  }

  res.writeHead(404); res.end()
})

httpServer.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    exec(`start http://localhost:${PORT}`)  // 이미 실행 중 → 브라우저만 열기
    process.exit(0)
  }
  console.error(err)
})

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`Server Manager: http://localhost:${PORT}`)
  exec(`start http://localhost:${PORT}`)
})

process.on('SIGINT', () => {
  stopServer('backend'); stopServer('frontend')
  setTimeout(() => process.exit(0), 2500)
})
