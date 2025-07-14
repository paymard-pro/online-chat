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
const users = {}; // { id : {id:.. , name:.. , avatar:.. } }
const sockets  = {}; // { id : socket }
let nextUserIndex = 1 ;

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
        content TEXT ,
        send TEXT,
        receive TEXT,
        read INTEGER DEFAULT 0
    )
`).run();


app.post("/api/users", (req, res) => {
    const { name  , avatar} = req.body;
    if (!name || !avatar) {
        return res.status(400).json({ success: false, error: "Field data is required" });
    }

    const uniqueId = uuidv4();

    db.prepare('INSERT INTO users (name , userId , avatar) VALUES (?,?,?)').run(name, uniqueId, avatar);
    let newUser = {id: uniqueId , name , avatar , index : nextUserIndex++};
    users[uniqueId] = newUser ;

    console.log(newUser);

    res.status(201).json({id:uniqueId});

});

app.get('/api/users' , (req , res) => {
    const sortUsers = Object.values(users).sort((a,b) => a.index - b.index);
    console.log('users : ' , sortUsers);

    res.json(sortUsers);
})


app.get('/api/user' , (req , res) => {
    console.log('id: ', req.query.id);
    console.log('user: ' , users[req.query.id]) ;

    res.json(users[req.query.id]);
})



app.post('/api/data' , (req , res) => {
    let data = req.body;
    const id = data.id;
    const messages = db.prepare(`SELECT * FROM messages WHERE send = ? OR receive = ? ORDER BY id ASC  `).all(id , id);
    const users = db.prepare(`SELECT DISTINCT u.name , u.avatar , u.userId AS id FROM users u WHERE u.userId != ? AND (u.userId IN (SELECT receive FROM messages WHERE send = ?) OR u.userId IN (SELECT send FROM messages WHERE receive = ?))`).all(id , id , id);
    const me = db.prepare(`SELECT name , userId AS id , avatar FROM users WHERE userid = ?`).get(id);
    res.json({messages , users , me});
})

io.on('connection', (socket) => {

    if(socket.userId) {
        console.log('user connected : ', socket.userId);
    }
    else
        console.log('user connected first time: ', socket.id);



    socket.on('setSocket' , (data) => {
        let userId = data.id
        sockets[userId] = socket;
        socket.userId = userId;

        if(!users[userId]) {
            let user = db.prepare(`SELECT userId AS id, name, avatar FROM users WHERE userId == ?`).get(userId);
            user.index = nextUserIndex++;
            console.log('user get db: ', user);
            users[userId] = user;
        }


        io.emit('onlineContact' , users[userId]);

    })

    socket.on('send' , (data) => {
        db.prepare(`INSERT INTO messages (content , send , receive) VALUES (? , ? , ?)`).run(data.message , data.send , data.receive);
        if(sockets[data.receive] && sockets[data.receive].connected)
            sockets[data.receive].emit('receive' , {message: data.message , send: data.send}) ;
    })

    socket.on('read' , (data) => {
        db.prepare(`UPDATE messages SET read = 1 WHERE send = ? AND receive = ? AND read = 0`).run(data.send , socket.userId);
    })

    socket.on('disconnect', () => {
        const id = socket.userId;

        console.log('user disconnected : ' , id);

        delete sockets[id];
        delete users[id];

        io.emit('offlineContact' , {id});
    });

});

http.listen(process.env.PORT || 3000, () => {
    console.log('Server running');
});