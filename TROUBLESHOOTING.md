# 🔧 Troubleshooting Guide — AnimeFlix

## How to Start the Project

You need **two terminals** running at the same time:

| Terminal   | Command          | What it does                                          |
| ---------- | ---------------- | ----------------------------------------------------- |
| Terminal 1 | `node proxy.cjs` | Starts the API proxy on `http://localhost:8080`       |
| Terminal 2 | `npm run dev`    | Starts the Vite dev server on `http://localhost:5173` |

> **Important:** Start the proxy server (`proxy.cjs`) **first**, then the Vite dev server.

---

## ❌ Error: `EADDRINUSE: address already in use 0.0.0.0:8080`

This means port 8080 is already occupied by a previous process that didn't shut down properly.

### Fix (macOS / Linux):

**Step 1 — Find what's using port 8080:**

```bash
lsof -i :8080
```

You'll see output like:

```
COMMAND   PID   USER   FD   TYPE  DEVICE  SIZE/OFF NODE NAME
node      12345 nahid  23u  IPv4  ...     0t0      TCP  *:8080 (LISTEN)
```

**Step 2 — Kill it:**

```bash
kill -9 12345
```

Replace `12345` with the actual PID from the output above.

**One-liner shortcut (kill + restart):**

```bash
lsof -ti :8080 | xargs kill -9; node proxy.cjs
```

### Fix (Windows):

```bash
netstat -ano | findstr :8080
taskkill /PID <PID_NUMBER> /F
node proxy.cjs
```

---

## ❌ Error: `EADDRINUSE: address already in use :::5173`

Same issue but for the Vite dev server port.

```bash
# Find and kill whatever is on port 5173
lsof -ti :5173 | xargs kill -9

# Restart
npm run dev
```

---

## ❌ Proxy is running but the site shows "Unable to Connect to API"

- Make sure `proxy.cjs` is actually running in a terminal (you should see: `Node-Animetsu-API CORS Proxy is listening on port 8080`)
- Check that your `.env` file (if any) has `VITE_API_BASE_URL=http://localhost:8080` or that you haven't changed the default in `src/config.js`
- Try opening `http://localhost:8080/api/home` in your browser — if you get JSON data, the proxy is working

---

## ❌ Videos don't play / Streaming not working

- Make sure `proxy.cjs` is running — streaming goes through the local proxy
- Try switching servers (Auto → kite → dio) on the watch page
- Try switching between SUB and DUB
- Check the browser console (F12 → Console) for errors

---

## 🔄 How to Fully Restart Everything

```bash
# Kill all node processes (nuclear option)
killall node

# Or kill only specific ports
lsof -ti :8080 | xargs kill -9
lsof -ti :5173 | xargs kill -9

# Start fresh
node proxy.cjs          # Terminal 1
npm run dev             # Terminal 2
```

---

## 🛑 How to Stop the Servers

Press `Ctrl + C` in each terminal window to gracefully stop:

- `Ctrl + C` in the proxy terminal stops the API proxy
- `Ctrl + C` in the Vite terminal stops the dev server

---

## 🔌 Changing Ports

**Proxy server (default 8080):**

```bash
PORT=9090 node proxy.cjs
```

Then update `VITE_API_BASE_URL` in your `.env` file to `http://localhost:9090`.

**Vite dev server (default 5173):**

```bash
npm run dev -- --port 3000
```

---

## 📋 Quick Reference Commands

| Task                    | Command                           |
| ----------------------- | --------------------------------- |
| Start proxy             | `node proxy.cjs`                  |
| Start frontend          | `npm run dev`                     |
| Kill port 8080          | `lsof -ti :8080 \| xargs kill -9` |
| Kill port 5173          | `lsof -ti :5173 \| xargs kill -9` |
| Kill all Node processes | `killall node`                    |
| Check what's on a port  | `lsof -i :<PORT>`                 |
