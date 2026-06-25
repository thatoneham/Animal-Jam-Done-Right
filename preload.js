const {app, contextBridge, ipcRenderer } = require("electron");
const path = require("path");


const LoginSimplifier = require(path.resolve(__dirname, "api", "Login.js"))



const netHelper = (options) => ipcRenderer.invoke("net-fetch", options)
const loadPage = (page,data = null) => ipcRenderer.invoke("loadPage", page,data)


// just login urls
const authenticatePath = "https://authenticator.animaljam.com/authenticate"
const flashVarsPath = "https://animaljam.com/flashvars"
const loginAuthPath = "https://ajelectronapi.animaljam.com/v1/login"
const playerDataPath = "https://player-session-data.animaljam.com/player"
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) AJClassic/1.5.7 Chrome/87.0.4280.141 Electron/11.5.0 Safari/537.36"

const environmentVariables = {
  isElectron: true,
  authenticatePath,
  flashVarsPath,
  playerDataPath,
  loginAuthPath,
  userAgent,
  initialized: () => ipcRenderer.invoke("get-initialized"),
  port: () => ipcRenderer.invoke("get-port"),
  populateLocalData: () => ipcRenderer.invoke("populate-local-data"),
  appUserData: () => ipcRenderer.invoke("get-app-userData"),
  updateVersion: (ver) => ipcRenderer.invoke("update-folder-version"),

  createWindow: (windowName,path,config) => ipcRenderer.invoke("create-window",windowName,path,config),
  sendToWindow: (windowName,type,data) => ipcRenderer.invoke("send-to-window",windowName,type,data),
  closeWindow: (windowName) => ipcRenderer.invoke("close-window",windowName),
  focusWindow: (windowName) => ipcRenderer.invoke("focus-window",windowName)
}

const loginHelper = new LoginSimplifier(environmentVariables,netHelper)

window.LoginSimplifier = {
  startLoginProcess: (...args) =>
    loginHelper.startLoginProcess(...args),
  startTokenLogin: (...args) => 
    loginHelper.startTokenLogin(...args)
};

// for all pages to know the dir
window.path = path.resolve(__dirname);

window.env = environmentVariables;

window.electronAPI = {
  netFetch: netHelper,
  loadPage,
  onCallbackData: (fn) =>
    ipcRenderer.once("callback-data", (_, data) => fn(data))
};


// dunno if i need that

window.ipc = {
    on: (channel, fn) => {
        ipcRenderer.on(channel, (_event, data) => fn(data));
    },
    once: (channel, fn) => {
        ipcRenderer.once(channel, (_event, data) => fn(data));
    },
    send: (channel, data) => {
        ipcRenderer.send(channel, data);
    },
    sendToHost: (channel, ...args) => {
        ipcRenderer.sendToHost(channel, ...args);
    }
};

// just debug stuff
ipcRenderer.on("main-log", (_e, msg) => {
  console.log(msg);
});