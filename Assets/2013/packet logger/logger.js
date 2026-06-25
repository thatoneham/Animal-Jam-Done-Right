const { ipcRenderer } = require("electron")

const windowOptions = {
    width: 600,
    height: 450,
    minHeight: 200,
    minWidth: 200,
    autoHideMenuBar: true,
    
    icon: __dirname + "/packet logger/icon.png",
    webPreferences: {
      webviewTag: true,
      contextIsolation: false,
      //preload: __dirname + "/preload.js",
      plugins: true,
      nodeIntegration: true,
      sandbox: false
    }
}

let win = null
let windowOpen = false
let toServer = true
let currentRoom = -1

let connectedOpen = false

const packetToggleBtn = document.getElementById("packet-log-btn")

function toggleWindow(toggle = true){
    windowOpen = toggle
    if (toggle){
        window.env.createWindow("packetMaster","packet logger/index.html",windowOptions)
    } else {
        window.env.closeWindow("packetMaster")
    }
}


function setupWindow(){
    console.log("[PACKET LOGGER] ready to log!")
}

function sendData(string,toServer){
    if (!currentTcpProxy) return
    string = string.replace("{r}",currentRoom)
    console.log("[PACKET LOGGER] sending ", string)
    if (toServer){
        currentTcpProxy.servers.forEach(server => {
            server.write(Buffer.from(string + "\0", "utf8"))
        });
    } else {
        currentTcpProxy.clients.forEach(client => {
            client.write(Buffer.from(string + "\0", "utf8"))
        });
    }
    window.env.sendToWindow("packetMaster","packet",{text:string,isIn:toServer})
}


ipcRenderer.on("window-event", (e, event, msg) => {
  switch (event){
    case "PMonLoad":
        setupWindow()
        break
    case "PMtoServer":
        toServer = msg
        console.log("toggle to server ", msg)
        break
    case "PMsendPacket":
        
        if (currentTcpProxy){
            sendData(msg,toServer)
        }   
  }
})

function proxyLoaded(){ // runs when currentTcpProxy gets initiated in game.js
    currentTcpProxy.on("data",(string,isServer) =>{
        if (isServer && string.startsWith("%xt%rj%")){
            var split = string.split("%",7)
            if (split[2] == "rj" && split[4] == "1"){
                currentRoom = parseInt(split[6])
                console.log(`[PACKET LOGGER] set room to ${currentRoom}`)
            } else if (split[4] != "1"){
                console.log(`[PACKET LOGGER] room join error ${split[5]}`)
            }
        }

        window.env.sendToWindow("packetMaster","packet",{text:string,isIn:!isServer})
    })

    if (!connectedOpen){
        connectedOpen = true
        packetToggleBtn.addEventListener("mousedown",()=>{
            // if (windowOpen){
            //     window.env.focusWindow("packetLogger")
            // } else {
            //     toggleWindow(!windowOpen)
            // }
            toggleWindow(!windowOpen)
        })
    }
}