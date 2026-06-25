const { ipcRenderer } = require("electron")

let toServer = true

let packets = []

let autoScroll = true 

const packetContent = document.getElementById("center")

function call_after_DOM_updated(fn)
{
    intermediate = function () {window.requestAnimationFrame(fn)}
    window.requestAnimationFrame(intermediate)
}

function scrollToBottom() {
    if (!autoScroll) return

    call_after_DOM_updated(() => {
        packetContent.scrollTop = packetContent.scrollHeight;
    });
    
}

function createPacket(text,isIn = true){
    const packet = document.createElement("div")
    packet.classList = `packet ${isIn ? "in" : "out"}`
    packet.innerText = text

    packets.push({text,isIn})
    packetContent.appendChild(packet)

    scrollToBottom()
}

sendType.addEventListener("mousedown",()=>{
    toServer = !toServer
    sendType.innerText = toServer ? "server" : "client"
    ipcRenderer.send("from-window", "PMtoServer", toServer)
})

clearBtn.addEventListener("mousedown",()=>{
    packets = []
    packetContent.innerHTML = ""
})

sendBtn.addEventListener("mousedown",()=>{
    var text = packetInput.value

    ipcRenderer.send("from-window", "PMsendPacket", text)
})
window.addEventListener('resize', () => {
    if (autoScroll){
        packetContent.scrollTop = packetContent.scrollHeight - packetContent.clientHeight
    }
});
packetContent.addEventListener("scroll",()=>{
    autoScroll = packetContent.scrollTop >= (packetContent.scrollHeight - packetContent.clientHeight) - 2
})




ipcRenderer.on("packet", (event, data) => {
  createPacket(data.text,data.isIn)
})

ipcRenderer.send("from-window", "PMonLoad")