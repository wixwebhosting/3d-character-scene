const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON from client so we can receive error logs
app.use(express.json({ limit: '1mb' }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// List available images in /public/images
app.get('/assets/images', (req, res) => {
	const dir = path.join(__dirname, 'public', 'images');
	fs.readdir(dir, (err, files) => {
		if (err) return res.json([]);
		const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp']);
		const list = files
			.filter(f => allowed.has(path.extname(f).toLowerCase()))
			.map(f => `/images/${f}`);
		res.json(list);
	});
});

// List available background music mp3s (excluding walking.mp3)
app.get('/assets/audio', (req, res) => {
	const roots = [path.join(__dirname, 'public'), path.join(__dirname, 'public', 'music')];
	const seen = new Set();
	const out = [];
	for (const root of roots) {
		try{
			const files = fs.readdirSync(root);
			files.forEach(f => {
				if (path.extname(f).toLowerCase() === '.mp3' && f.toLowerCase() !== 'walking.mp3'){
					const rel = root.endsWith(path.sep + 'music') ? `/music/${f}` : `/${f}`;
					if (!seen.has(rel)) { seen.add(rel); out.push(rel); }
				}
			});
		}catch(e){/* ignore */}
	}
	res.json(out);
});

// Client-side error logging endpoint
app.post('/log', (req, res) => {
	try{
		const payload = req.body || {};
		console.log('CLIENT LOG:', payload);
	// broadcast to SSE clients
	broadcastLog({from:'client', payload});
	} catch(e){
		console.error('Failed to log client message', e);
	}
	res.sendStatus(204);
});

// Simple Server-Sent Events endpoint to broadcast logs to connected browsers
const clients = new Set();
app.get('/events', (req, res)=>{
	res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' });
	res.flushHeaders && res.flushHeaders();
	res.write('\n');
	clients.add(res);
	req.on('close', ()=>{ clients.delete(res); });
});

function broadcastLog(obj){
	// Safe stringify to avoid circular references and very deep objects
	function safeStringify(value, depth = 3) {
		const seen = new WeakSet();

		function scrub(v, d) {
			if (v === null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
			if (typeof v === 'function') return `[Function: ${v.name || 'anonymous'}]`;
			if (typeof v !== 'object') return String(v);
			if (seen.has(v)) return '[Circular]';
			if (d <= 0) return Array.isArray(v) ? '[Array]' : '[Object]';
			seen.add(v);
			if (Array.isArray(v)) return v.map(item => scrub(item, d - 1));
			const out = {};
			for (const key of Object.keys(v)) {
				try { out[key] = scrub(v[key], d - 1); } catch (e) { out[key] = `[Unserializable: ${e && e.message}]`; }
			}
			return out;
		}

		return JSON.stringify(scrub(value, depth), null, 2);
	}

	let data;
	try {
		data = safeStringify(obj, 3);
	} catch (err) {
		console.error('Failed to stringify log object', err);
		data = '"[Unserializable]"';
	}

	for (const res of clients) {
		try {
			// write raw data string (already JSON). Wrap in try/catch per-client.
			res.write(`data: ${data}\n\n`);
		} catch (e) {
			// remove dead client
			clients.delete(res);
		}
	}
}

app.listen(PORT, () => {
	console.log(`Server running: http://localhost:${PORT}`);
});
