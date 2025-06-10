// نمونه کد سرور برای Render
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*" // در تولید محدود کنید
    }
});

// لیست کاربران و اتاق‌ها
const users = [];
const rooms = {};

io.on('connection', (socket) => {

    console.log('کاربر متصل شد:', socket.id);

    // ورود به اتاق چت
    socket.on('joinChat', (username) => {
        if(users.length>=2) {
            console.log('chat is full!');
            socket.emit('chatFull');
            return;
        }
        users.push(socket);
        socket.emit('message', 'به چت خوش آمدید!');
        console.log(`${username} وارد چت شد.`);
    });

    // ارسال پیام به همه
    socket.on('sendMessage', (message) => {
        console.log(`${users[0].id} - ${users[1].id} - ${users.length}` );
        socket.emit('messageSend', `${message}`);
        users.filter(s => s!== socket)[0].emit('messageReceive' , `${message}`);
        console.log(`پیام: ${message}`);
    });

    // قطع اتصال
    socket.on('disconnect', () => {
        console.log('کاربر خارج شد:');
        delete users[socket];
    });

    socket.on('resetData' , () => {
        users.length = 0;
        console.log('clear all users');
    })
});

http.listen(process.env.PORT || 3000, () => {
    console.log('Server running');
});
