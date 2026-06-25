const fs = require("fs")
// require stuff
const { shell } = require("electron")

const path = require('path')
const TcpProxy = require("../../api/TcpProxy")


let currentTcpProxy = null

const flashContent = document.getElementById("flash-content");
const usernameHolder =  document.getElementById("user-display")

let flashVars = null



let doneConfigLoad = false
let filePath = ""
let resolveFn;

let saveData = null
const waitForTrue = new Promise(resolve => {
  resolveFn = resolve;
});


function readStore() {
  if (!fs.existsSync(filePath)) return {}
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function writeStore(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

async function initConfig() {
  const userDataPath = await window.env.appUserData();


  filePath = path.join(userDataPath, "config.json");
  saveData = readStore()
  doneConfigLoad = true
  resolveFn()
}

async function setKey(key,value){
  if (!doneConfigLoad){
    await waitForTrue;
  }
  saveData[key] = value
  writeStore(saveData)
}


function initializeGameListeners(){
    const theaterBtn = document.getElementById('theater-btn');
    const gameEmbededBorder = document.getElementById('game-embed-border');
    theaterBtn.addEventListener('click', () => {
        console.log('theater mode toggled');
        gameEmbededBorder.classList.toggle('theater-mode');
    })
}


async function createWebView(){
  const webview = document.createElement('webview');
  webview.id = 'webview';
  webview.setAttribute("preload", window.path + "/api/flashPreload.js");
  webview.setAttribute("nodeintegration", "true");
  webview.setAttribute("webpreferences","plugins=yes,contextIsolation=no,sandbox=no");
  webview.style.width = "100%";
  webview.style.height = "100%";

  //webview.partition = "persist:game"

  webview.src = `http://localhost:${flashVars.httpPort}/index.html`;
  // we use our local game client

  webview.addEventListener('dom-ready',async () => {
    console.log('webview loaded');  
    
    // to spoof the user agent 
    webview.setUserAgent(window.env.userAgent)
    
    // just debug
    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key === "i") {
        webview.openDevTools();
      }
    });

    webview.addEventListener("did-finish-load", () => {
      //webview.clearHistory()
      //webview.openDevTools();
      console.log(flashVars)
      setTimeout(()=>{
        webview.send("flashVarsReady", flashVars);
      },200)
    })
  });
  document.getElementById('embed').appendChild(webview);
}


async function startProxyAndpatchFlashVars(vars){
  // first we populate the data we have IN our proxy folder
  await window.env.populateLocalData()

  const port = await window.env.port()
  // we fix the urls
  var proxyUrl = `http://localhost:${port}` 
  vars.clientURL = proxyUrl + (new URL(vars.clientURL).pathname)
  vars.content = proxyUrl
  console.log("proxy url is ", proxyUrl)  

  // next we start la tcp proxy
  const proxy = new TcpProxy({
    origin: vars.smartfoxServer,
    serverPort: 9003,
    port: vars.smartfoxPort,
    httpPort: port,
    servername: vars.smartfoxServer // idk why i need this
  })
  currentTcpProxy = proxy
  const tlsPort = await proxy.startTcpProxy()

  // and fix the data
  //vars.forceHttpProxy = false
  vars.smartfoxPort = tlsPort
  vars.httpPort = port
  vars.smartfoxServer = "127.0.0.1"
  vars.game_server = "127.0.0.1"
  vars.blueboxServer = "127.0.0.1"


  console.log("[TCP PROXY] client url is ", vars.clientURL)
  console.log("[TCP PROXY] tcp port is ", tlsPort)
  console.log(vars)
  proxyLoaded()
  return vars
}

async function initializeClient(vars) {
  flashVars = await startProxyAndpatchFlashVars(vars);
  usernameHolder.innerText = "Hi " + flashVars.screen_name

  await createWebView()
  //flashVarsReady(flashVars)
}

function loadPage(url){
  window.electronAPI.loadPage("pageViewer.html",url);
}

async function goToHome(logOut = false){
  if (logOut){
    await setKey("authToken",null)
  }
  window.electronAPI.loadPage("index.html");
}


initConfig().then(()=>{
  window.electronAPI.onCallbackData(async (data) => {
    await initializeClient(data)
  })

  initializeGameListeners()
})