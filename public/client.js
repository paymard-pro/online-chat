const socket = io('https://online-chat-7sal.onrender.com');

//'http://192.168.1.3:3000'

const allMenu = document.querySelectorAll('.menu');
const nameDoc = document.getElementById('name');
const authMenu = document.getElementById('authMenu');
const mainMenu = document.getElementById('mainMenu');
const contactsMenu = document.getElementById('contactsMenu');
const chatMenu = document.getElementById('chatMenu');

const chatList = document.getElementById('chatList');
const avatarsDoc = document.querySelectorAll('.borderAvatar');

const avatarProfHeader = document.querySelector('#headerProf img');
const nameProfHeader = document.querySelector('#headerProf h1');
const chatTemplate = document.getElementById('chat-template');

const chatScreen = document.getElementById('chatScreen');

const allContacts = document.querySelector('#allContacts');



let avatarSrc = avatar => `assets/avatars/${avatar}.png` ;
let sendSrc = `assets/UI/send.png`;
let backSrc = `assets/UI/back/png`;


let name ;
let avatar = 0 ;
let id ;
let contactInChat = null;

// let messages = []; // [ ... , {contact:.. , send:.. , receive:..} ]
// let users = []; // [ ... , {id:.. , name:.. , avatar:..} ]

let users = {} ; // { id : {id , name , avatar , messages , online , lastMessage , unread} }  --- messages = [] // [... , {content , sendMe } ]
let nextMessageId = 1 ;



//---------------------------------- AUTH ---------------------------------------


async function submitAuth(){
    let locName = nameDoc.value.trim();
    if(!locName || locName == "" ) {
        alert('فیلد نام خالیه!');
        return;
    }
    else if(!/^[\u0600-\u06FFa-zA-Z0-9۰-۹ ]+$/.test(locName)) {
        alert('نام ورودی معتبر نیست!\nفقط میتونی از حروف و ارقام استفاده کنی');
        return;
    }
    else if(avatar == 0) {
        alert('چرا هیچ آواتاری انتخاب نکردی؟');
        return;
    }
    else if (locName.length >= 20){
        alert('اسمت خیلی گندس!');
        return;
    }

    name = locName;

    try{

        console.log('name:' , name , 'avatar:' , avatar);
        const res = await fetch('/api/users', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name , avatar })
        });

        const data = await res.json();

        id = data.id;
        localStorage.setItem(`user-id` , id); // TODO

    }catch (err){
        alert(err);
    }

    socket.emit('setSocket' , {id});

    loadMain();
}


function clickAvatar(element , index){

    if(avatar != 0 ){
        for (let avatarDoc of avatarsDoc){
            if(avatarDoc.dataset.index == avatar){
                avatarDoc.style.borderColor = 'rgba(0 , 0 , 0 , 0)';
                break;
            }
        }
    }

    avatar = index;
    element.style.borderColor = '#00f0ff';
}


//---------------------------------- CONTACTS ---------------------------------------

function clickContact(element) {

    const user = getUserByContact(element);

    loadChat(user);

}


function loadContact(user){

    const template = document.getElementById('contact-template');

    if(user.id == id) return;

    console.log('name : ' , name , '-user: ' , user);
    let templateCopy = template.content.cloneNode(true);
    let newContact = templateCopy.querySelector('.contact');

    newContact.dataset.id = user.id;
    newContact.querySelector('img').src = avatarSrc(user.avatar);
    newContact.querySelector('.infoContact b').innerHTML = user.name;
    //newContact.querySelector('.infoContact span').innerHTML = 'آنلاین'

    allContacts.prepend(newContact);
}

socket.on('onlineContact' , (user) => {
    if(contactsMenu.style.display == 'block') {
        for (e of document.querySelectorAll('.contact')){
            if(e.dataset.id == user.id) return;
        }

        loadContact(user);
    }

        //TODO online circle main
})

socket.on('offlineContact' , (data) => {

    if(contactsMenu.style.display == 'block') {
        for (let e of document.querySelectorAll('.contact')) {
            if (e.dataset.id == data.id) {
                e.remove();
                break;
            }
        }
    }
    // else if(mainMenu.style.display == 'block'){
    //     for (let e of document.querySelectorAll('.chat')){
    //         if(e.dataset.id == data.id){
    //             //TODO online circle
    //         }
    //     }
    // }
})


function clickBackContact(){
    loadMain();
}


//---------------------------------- MAIN ---------------------------------------

async function clickNewChat(){

    try{
        const res = await fetch('/api/users');
        const usersOn = await res.json();

        console.log('contacts:' , usersOn);

        allContacts.innerHTML = "";

        for(let user of usersOn){
            loadContact(user)
        }

        allMenu.forEach(e => {e.style.display = 'none'});
        contactsMenu.style.display = 'block';

    }catch (err){
        console.log(err);
    }

}

function clickChat(element){
    const user = getUserByContact(element);
    loadChat(user);
}


function loadMain(){
    nameProfHeader.innerHTML = name;
    avatarProfHeader.src = avatarSrc(avatar);

    chatList.innerHTML = '';

    Object.keys(users).sort((a , b) => users[a].messages.at(-1).id - users[b].messages.at(-1).id).forEach(userId => {
        loadChatBox(users[userId]);
    })

    allMenu.forEach(e => {e.style.display = 'none'});
    mainMenu.style.display = 'block'
}


function loadChatBox(user){
    const template = chatTemplate.content.cloneNode(true);
    const chatBox = template.querySelector('.chat');

    chatBox.dataset.id = user.id ;
    chatBox.querySelector('img').src = avatarSrc(user.avatar);
    chatBox.querySelector('.showChat b').innerHTML = user.name;
    chatBox.querySelector('.showChat span').innerHTML = lastMessage(user);
    if(user.unread > 0) {
        chatBox.querySelector('.countMassage span').innerHTML = user.unread;
        chatBox.querySelector('.countMassage').style.display = 'flex';
    }
    chatList.prepend(chatBox);
}

function lastMessage(user){
    let message =  user.messages.at(-1).content; // last message
    if(message.length >= 20) message = '...' + message.slice(0 , 19) ;
    return message ;
}



//---------------------------------- CHAT ---------------------------------------

function loadChat(newUser){

    contactInChat = newUser.id;

    if(!users[contactInChat]){
        users[contactInChat] = {id: newUser.id , name : newUser.name , avatar:newUser.avatar , messages : [] , online:true , unread : 0};
    }

    const user = users[contactInChat] ;
    user.unread = 0;

    console.log('users:' , users)

    const prof = document.querySelector('#chatHeader .prof');
    prof.src = avatarSrc(user.avatar);

    const nameHe = document.querySelector('#chatHeader span');
    nameHe.innerHTML = user.name;

    chatScreen.innerHTML = '';

    console.log('messages: ' , users[user.id].messages);
    
    for(let message of users[user.id].messages){

        let messageBox = document.createElement('div');
        messageBox.innerHTML = message.content;
        if(message.sendMe)
            messageBox.className = 'message send';
        else
            messageBox.className = 'message receive';

        chatScreen.appendChild(messageBox);
    }

    allMenu.forEach(e => {e.style.display = 'none'});
    chatMenu.style.display = 'block'

    socket.emit('read' , {send: contactInChat});

}


async function clickSend(){
    const messageInput = document.querySelector('#chatInput input');
    let message = messageInput.value;
    messageInput.value = '';

    if(!message || message.trim() == "") return;

    //show my message
    const messageBox = document.createElement('div');
    messageBox.className = 'message send';
    messageBox.innerHTML = message ;

    chatScreen.appendChild(messageBox);

    users[contactInChat].messages.push({content: message , sendMe : true , id : nextMessageId++});

    socket.emit('send' , {message , send: id , receive: contactInChat });

}


socket.on('receive' , async (data) => {

    let isNew = users[data.send] ? false : true;

    if(isNew) {
        let newUser = await getUser(data.send);
        users[data.send] = {id: newUser.id , name : newUser.name , avatar:newUser.avatar , messages : [] , online:true , unread : 0} ;
    }

    const user  = users[data.send];

    user.unread ++ ;
    user.messages.push({content: data.message , sendMe : false , id: nextMessageId++});

    if(chatMenu.style.display == 'block' && contactInChat == data.send){
        user.unread = 0 ;
        const messageBox = document.createElement('div');
        messageBox.innerHTML = data.message ;
        messageBox.className = 'message receive';
        chatScreen.appendChild(messageBox);

        socket.emit('read' , {send: contactInChat});

    }
    else if(mainMenu.style.display == 'block'){
        if(!isNew){
            for(let e of document.querySelectorAll('.chat')){
                if(e.dataset.id == user.id){
                    e.remove();
                    break;
                }
            }
        }

        loadChatBox(user);
    }

})

function clickBackChat(){
    contactInChat = null ;
    loadMain();
}


//------------------------------------- UTILS ---------------------------------------


async function getUser(id){
    try{

        console.log('id: ' , id);
        const res = await fetch(`/api/user/?id=${id}`) ;
        const user = await res.json();

        return user;

    }catch (err){
        console.log(err);
    }
}


function getUserByContact(element){

    console.log(element);

    const id = element.dataset.id;
    const src = element.querySelector('img').src ;
    const name = element.querySelector('b').innerHTML;

    console.log('src:' , src , 'id:' , id , 'name:' , name);
    const avatar = src.match(/(?<=avatars\/)\d+/)[0];

    return {name , avatar , id};

}

async function start(){

    let userId = localStorage.getItem('user-id');
    if(!userId){
        authMenu.style.display = 'block'
        alert('به آنلاین چت خوش آمدید 😊\nلطفا پروفایل خود را کامل کنید.') ;
    }
    else {

        id = userId;

        socket.emit('setSocket' , {id});

        try{
            const res = await fetch('/api/data', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({id})
            });

            const data = await res.json();
            console.log('data: ' , data);

            loadData(data);

            console.log('my users: ' , users);

        }catch (err){
            alert(err);
        }

        loadMain();
    }
}

function loadData(data){

    console.log('1');

    name = data.me.name ;
    avatar = data.me.avatar ;

    users = {};

    console.log('name : ' , name , "-avatar :" , avatar);
    console.log('2');
    let i = 0 ; //debug

    for(let message of data.messages){
        console.log('3')

        let userId = message.send == id ? message.receive : message.send ;
        if(!users[userId]){
            let newUser = data.users.find(u => u.id == userId) ;
            users[userId] = {id: newUser.id , name : newUser.name , avatar:newUser.avatar , messages : [] , online:false , unread : 0};
        }

        let user = users[userId] ;

        let sendMe = message.send == id ? true : false ;
        user.messages.push({content: message.content , sendMe , id : message.id});
        if(!message.read && !sendMe) user.unread++ ;


        console.log('debug : ' , i++) ;
    }

    if(data.messages.length > 0)
        nextMessageId = data.messages.at(-1).id + 1; //last message

    console.log('4');

}

socket.on('connect' , () => {
    alert('یه لحظه قطع شدی');
    start()
})

start();