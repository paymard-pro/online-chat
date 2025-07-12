const express = require('express');
const app = express();
const http = require('http').createServer(app);
const path = require('path'); // برای کار با مسیر فایل‌ها
const  { v4 : uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
// باز کردن یا ساخت دیتابیس chat.db
const db = new Database('chat.db', { verbose: console.log }); // اگه خواستی لاگ کوئری‌ها رو ببینی

app.use(express.json());

// سرو کردن فایل‌های استاتیک (مثل HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// مسیر روت - ارسال فایل index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// بقیه کد Socket.io (همانند قبل)
const io = require('socket.io')(http, {
    cors: {
        origin: "*" // در تولید محدود کنید
    }
});

// لیست کاربران و اتاق‌ها
const users = []; // [ ... , {id:.. , name:.. , avatar:.. } ]
const sockets  = {};

db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT UNIQUE,
        name TEXT ,
        avatar INTEGER
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact TEXT ,
        send TEXT,
        receive TEXT
    )
`).run();


app.post("/api/users", (req, res) => {
    const { name  , avatar} = req.body;
    if (!name || !avatar) {
        return res.status(400).json({ success: false, error: "Field data is required" });
    }

    const uniqueId = uuidv4();

    db.prepare('INSERT INTO users (name , userId , avatar) VALUES (?,?,?)').run(name, uniqueId, avatar);
    let newUser = {id: uniqueId , name , avatar };
    users.push(newUser);

    console.log(users);

    res.status(201).json({id:uniqueId});

});


app.get('api/users/:id' , (req , res) => {
    res.json(users[req.params.id]);
})


app.post('/api/data' , (req , res) => {
    let data = req.body;
    const id = data.id;
    const messagesMe = db.prepare(`SELECT contact , send , receive FROM messages WHERE send = ? OR receive = ?`).all(id , id);
    const usersMe = db.prepare(`SELECT DISTINCT u.name , u.avatar , u.userId FROM users u WHERE u.userId != ? AND (u.userId IN (SELECT receive FROM messages WHERE send = ?) OR u.userId IN (SELECT send FROM messages WHERE receive = ?))`).all(id , id , id);
    const me = db.prepare(`SELECT name , userId AS id , avatar FROM users WHERE userid = ?`).all(id);
    users.push(me);
    res.json({messages:messagesMe , users:usersMe , me});
})

io.on('connection', (socket) => {

    if(socket.userId) {
        console.log('user connected : ', socket.userId);
    }
    else
        console.log('user connected first time: ', socket.id);



    socket.on('setSocket' , (data) => {
        sockets[data.id] = socket;
        socket.userId = data.id;

        io.to('contacts').emit('addContact' , users.find(u => u.id == data.id));

    })

    socket.on('joinContacts' , () => {
        socket.join('contacts');
    })

    socket.on('leaveContacts', () => {
        socket.leave('contacts');
    })

    socket.on('send' , (data) => {
        db.prepare(`INSERT INTO messages (contact , send , receive) VALUES (? , ? , ?)`).run(data.message , data.send , data.receive);
        sockets[data.receive].emit('receive' , {message: data.message , send: data.send}) ;
    })

    socket.on('disconnect', () => {
        const id = socket.userId;

        console.log('user disconnected : ' , id);

        delete sockets[id];
        users.splice(users.indexOf(users.find(u => u.id == id)) , 1);

        io.to('contacts').emit('remContact' , {id});
    });

});

http.listen(process.env.PORT || 3000, () => {
    console.log('Server running');
});