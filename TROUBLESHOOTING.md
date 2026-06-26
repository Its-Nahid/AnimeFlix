# 🔧 Troubleshooting Guide — AnimeFlix

Common issues and their fixes. If your problem isn't listed here, [open an issue](https://github.com/Its-Nahid/AnimeFlix/issues).

---

## 🚀 How to Start the Project

You need **two terminals** running at the same time:

| Terminal | Command | What it does |
|---|---|---|
| Terminal 1 | `node proxy.cjs` | Starts the API proxy on `http://localhost:8080` |
| Terminal 2 | `npm run dev` | Starts the Vite dev server on `http://localhost:5173` |

> **Tip:** Start the proxy server first, then the Vite dev server.

---

## ❌ `EADDRINUSE: address already in use 0.0.0.0:8080`

Port 8080 is occupied by a leftover process.

**macOS / Linux:**

```bash
# Find what's using port 8080
lsof -i :8080

# Kill it (replace 12345 with the actual PID)
kill -9 12345

# Or use this one-liner
lsof -ti :8080 | xargs kill -9; node proxy.cjs
```

**Windows:**

```bash
netstat -ano | findstr :8080
taskkill /PID <PID_NUMBER> /F
node proxy.cjs
```

---

## ❌ `EADDRINUSE: address already in use :::5173`

Same issue but for the Vite dev server port.

```bash
lsof -ti :5173 | xargs kill -9
npm run dev
```

---

## ❌ Site shows "Unable to Connect to API"

1. Make sure `proxy.cjs` is running — you should see: `Node-Animetsu-API CORS Proxy is listening on port 8080`
2. Verify `VITE_API_BASE_URL` in your `.env` file (if any) is set to `http://localhost:8080`
3. Test the proxy directly: open `http://localhost:8080/api/home` in your browser — if you get JSON, the proxy is working

---

## ❌ Videos Don't Play / Streaming Not Working

- Make sure `proxy.cjs` is running — all streaming goes through the local proxy
- Try switching servers (Auto → Kite → Dio) on the watch page
- Try switching between SUB and DUB
- Check the browser console (`F12` → Console) for specific errors
- If you see **mixed content** errors (`http://` vs `https://`), make sure you're accessing the site via `http://localhost:5173`, not an HTTPS URL (in development)

---

## ❌ Episode Thumbnails Not Loading

Episode thumbnails are fetched from the Zenshin API (free tier on Render). If thumbnails aren't appearing:

- The Zenshin API may be cold-starting (give it ~30 seconds on first load)
- Some anime may not have TVDB episode screenshots mapped
- Thumbnails for Animetsu-sourced images are routed through the proxy — make sure `proxy.cjs` is running

---

## 🔄 Full Restart (Nuclear Option)

```bash
# Kill all node processes
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

Press `Ctrl + C` in each terminal window:

- `Ctrl + C` in the proxy terminal → stops the API proxy
- `Ctrl + C` in the Vite terminal → stops the dev server

---

## 🔌 Changing Ports

**Proxy server (default 8080):**

```bash
PORT=9090 node proxy.cjs
```

Then set `VITE_API_BASE_URL=http://localhost:9090` in a `.env` file at the project root.

**Vite dev server (default 5173):**

```bash
npm run dev -- --port 3000
```

---

## 📋 Quick Reference

| Task | Command |
|---|---|
| Start proxy | `node proxy.cjs` |
| Start frontend | `npm run dev` |
| Kill port 8080 | `lsof -ti :8080 \| xargs kill -9` |
| Kill port 5173 | `lsof -ti :5173 \| xargs kill -9` |
| Kill all Node processes | `killall node` |
| Check what's on a port | `lsof -i :<PORT>` |
| Production build | `npm run build` |
| Preview production build | `npm run preview` |
