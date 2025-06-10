const socket = io('https://online-chat-test-38ge.onrender.com');
const chatBox = document.getElementById('chatBox');
const messageInput = document.getElementById('messageInput');

// ورود به چت
const username = prompt('نام خود را وارد کنید:') || 'ناشناس';
socket.emit('joinChat', username);

// ارسال پیام
document.getElementById('sendButton').addEventListener('click', () => {
    const message = messageInput.value;
    if (message) {
        socket.emit('sendMessage', message);
        messageInput.value = '';
    }
});

// دریافت پیام‌ها
socket.on('messageReceive', (msg) => {
    const messageElement = document.createElement('div');
    messageElement.textContent = msg;
    messageElement.className ="msg receive";
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on('messageSend' , (msg) => {

    const messageElement = document.createElement('div');
    messageElement.textContent = msg;
    messageElement.className ="msg send";
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
})

socket.on('chatFull' , () => {
    document.querySelector('.input').innerHTML = "chat is full!" ;
})

document.getElementById('reset').addEventListener('click' , () =>{
    socket.emit('resetData');
    chatBox.innerHTML = "";
})
