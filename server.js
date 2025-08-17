import express from 'express';
import http from 'http';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';

// __filename / __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = http.createServer(app);

// ---- SQLite (sqlite3) ----
sqlite3.verbose();
const db = new sqlite3.Database(path.join(__dirname, 'chat.db'));

// promisified helpers
const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ changes: this.changes, lastID: this.lastID });
        });
    });

const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

async function initDb() {
    await exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

    await run(`
        CREATE TABLE IF NOT EXISTS users (
                                             id INTEGER PRIMARY KEY AUTOINCREMENT,
                                             userId TEXT UNIQUE,
                                             name TEXT,
                                             avatar INTEGER
        )
    `);

    await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT,
      send TEXT,
      receive TEXT,
      read INTEGER DEFAULT 0
    )
  `);

    await run(
        'INSERT OR IGNORE INTO users (name, userId, avatar) VALUES (?, ?, ?)',
        ['رایا', 'bot', 10]
    );
}

// small exec helper for multi-statement PRAGMA
function exec(sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
}

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const users = {};   // { id : {id, name, avatar} }
const sockets = {}; // { id : socket }
const group = { users: [], messages: [] };

// ایجاد کاربر
app.post('/api/users', async (req, res) => {
    try {
        const { name, avatar } = req.body;
        if (!name || avatar === undefined) {
            return res.status(400).json({ success: false, error: 'Field data is required' });
        }

        const uniqueId = uuidv4();
        await run('INSERT INTO users (name, userId, avatar) VALUES (?, ?, ?)', [name, uniqueId, avatar]);

        const newUser = { id: uniqueId, name, avatar };
        users[uniqueId] = newUser;

        console.log(newUser);
        res.status(201).json({ id: uniqueId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

// لیست کاربران آنلاینِ در حافظه
app.get('/api/users', (req, res) => {
    const sortUsers = Object.values(users).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    console.log('users : ', sortUsers);
    res.json(sortUsers);
});

// دریافت یک کاربر از DB
app.get('/api/user', async (req, res) => {
    try {
        const id = req.query.id;
        const user = await get('SELECT * FROM users WHERE userId = ?', [id]);
        console.log('get user: ', user);

        res.json({ id, name: user?.name, avatar: user?.avatar });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

// داده‌های گفتگو (پیام‌ها + مخاطبین + خودم)
app.post('/api/data', async (req, res) => {
    try {
        const { id } = req.body;

        const messages = await all(
            `SELECT * FROM messages
             WHERE send = ? OR receive = ?
             ORDER BY id ASC`,
            [id, id]
        );

        const usersList = await all(
            `SELECT DISTINCT u.name, u.avatar, u.userId AS id
             FROM users u
             WHERE u.userId != ?
         AND (u.userId IN (SELECT receive FROM messages WHERE send = ?)
          OR u.userId IN (SELECT send FROM messages WHERE receive = ?))`,
            [id, id, id]
        );

        const me = await get(
            'SELECT name, userId AS id, avatar FROM users WHERE userId = ?',
            [id]
        );

        res.json({ messages, users: usersList, me });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

app.get('/api/group', (req, res) => {
    res.json(group);
});

// Socket.io
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
    if (socket.userId) {
        console.log('user connected : ', socket.userId);
    } else {
        console.log('user connected first time: ', socket.id);
    }

    socket.on('setSocket', async (data) => {
        const userId = data.id;
        sockets[userId] = socket;
        socket.userId = userId;

        if (!users[userId]) {
            const user = await get(
                `SELECT userId AS id, name, avatar FROM users WHERE userId = ?`,
                [userId]
            );
            console.log('user get db: ', user);
            users[userId] = user;
        }

        io.emit('onlineContact', users[userId]);
    });

    socket.on('send', async (data) => {
        try {
            if (data.receive === 'bot') {
                console.log('1');
                const resBot = await responseBot(data);
                const message = resBot.content;
                console.log('2');

                if (resBot.successful) {
                    await run(
                        `INSERT INTO messages (content, send, receive) VALUES (?, ?, ?)`,
                        [data.message, data.send, 'bot']
                    );
                    await run(
                        `INSERT INTO messages (content, send, receive) VALUES (?, ?, ?)`,
                        [message, 'bot', data.send]
                    );
                }
                socket.emit('receive', { message, send: 'bot' });
                return;
            } else if (isGroup(data.send)) {
                console.log('group');
                group.messages.push({ content: data.message, send: getUserId(data.send), read: false });
                socket.to('group').emit('receive', { message: data.message, send: data.send });
                return;
            }

            await run(
                `INSERT INTO messages (content, send, receive) VALUES (?, ?, ?)`,
                [data.message, data.send, data.receive]
            );

            if (sockets[data.receive] && sockets[data.receive].connected) {
                sockets[data.receive].emit('receive', { message: data.message, send: data.send });
            }
        } catch (e) {
            console.error(e);
        }

        function isGroup(id) {
            return !!id.match(/^group/);
        }
    });

    function getUserId(id) {
        const match = id.match(/group-(.*)$/);
        console.log('match:', match);
        return match ? match[1] : null;
    }

    async function responseBot(data) {
        try {
            const messages = [{
                role: 'system',
                content: 'تو یه ربات باحال هستی. اسمت رایا هست و از سیاره ای دور دست اومدی و الان روی زمین سرگردان هستی. خلاصه و کوتاه جواب بده و بعضی وقت ها هم از ایموجی استفاده کن'
            }];

            const chatBot = await all(
                `SELECT content, send FROM messages
                 WHERE (send = ? AND receive = ?) OR (send = ? AND receive = ?)
                 ORDER BY id ASC`,
                ['bot', data.send, data.send, 'bot']
            );

            for (const message of chatBot) {
                messages.push({ role: message.send === 'bot' ? 'assistant' : 'user', content: message.content });
            }
            messages.push({ role: 'user', content: data.message });

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'moonshotai/kimi-k2:free',
                    messages,
                }),
            });

            const json = await response.json();
            const res = json?.choices?.[0]?.message?.content ?? 'متاسفانه پاسخی دریافت نشد. 😔';
            console.log('پاسخ:', res);
            return { content: res, successful: true };
        } catch (err) {
            console.error(err);
            return { content: 'متاسفانه ارتباط برقرار نشد. 😔', successful: false };
        }
    }

    socket.on('read', async (data) => {
        try {
            if (data.send !== 'group') {
                await run(
                    `UPDATE messages SET read = 1
                     WHERE send = ? AND receive = ? AND read = 0`,
                    [data.send, socket.userId]
                );
            }
        } catch (e) {
            console.error(e);
        }
    });

    socket.on('joinGroup', () => {
        socket.join('group');
        group.users.push(socket.userId);
    });

    socket.on('disconnect', () => {
        const id = socket.userId;
        console.log('user disconnected : ', id);

        delete sockets[id];
        delete users[id];
        socket.leave('group');
        io.emit('offlineContact', { id });
    });
});

// راه‌اندازی
(async () => {
    try {
        await initDb();
        server.listen(3000, () => {
            console.log('Server is running on http://localhost:3000');
        });
    } catch (e) {
        console.error('DB init error:', e);
        process.exit(1);
    }
})();
