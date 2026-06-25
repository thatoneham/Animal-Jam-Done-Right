const { app, session, BrowserWindow, ipcMain, net } = require("electron")
const path = require("path");
const HttpProxy = require(__dirname +'/api/HttpProxy.js')

let initialized = false
let currentWindow = null
let currentTheme = "2013"
let pluginPath = ""

const isDev = !app.isPackaged
const httpProxy = new HttpProxy({ log: (...args) => logToWindow(...args) })



function readyFlash(){
  const arch = process.arch

  pluginPath = path.join(isDev ? __dirname : process.resourcesPath,"pepPlugin")

  switch (process.platform){
    case "linux":
      pluginPath = path.join(pluginPath,"linux_" + arch, "libpepflashplayer.so")
      app.commandLine.appendSwitch('--no-sandbox'); // needed for linux i think, otherwise wont run flash
      break
    case "win32":
      pluginPath = path.join(pluginPath,"windows_" + arch, "pepflashplayer.dll")
      break

    console.log("path res is ", pluginPath)
  }

}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 731,
    minHeight: 731,
    autoHideMenuBar: true,
    minWidth: 1015,
    icon: __dirname + "/icon.png",
    webPreferences: {
      webviewTag: true,
      contextIsolation: false,
      preload: __dirname + "/preload.js",
      plugins: true,
      nodeIntegration: true,
      sandbox: false
    }
  })
  currentWindow = win

  win.loadFile(`Assets/${currentTheme}/index.html`)
  win.on("closed",()=>{
    for (const windowName in customWindows){
      console.log(`[INDEXJS] closing custom window ${windowName}`)
      const win = customWindows[windowName]
      win.close()
      delete customWindows[windowName]
    }
  })
  httpProxy.startProxy().then(() => {
    initialized = true
    
  })
}


function logToWindow(...args) {
  const msg = args.map(a => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(" ");

  currentWindow.webContents.send("main-log", msg);
}


ipcMain.handle("loadPage", async (event, page, callback) => {
  if (!currentWindow) return

  currentWindow.webContents.once("did-finish-load", () => {
    currentWindow.webContents.send("callback-data", callback)
  })

  await currentWindow.loadFile(`Assets/${currentTheme}/${page}`)
})
ipcMain.handle("get-initialized", () => {
  return initialized; 
}) 
ipcMain.handle("get-app-userData", () => {
  return app.getPath("userData"); 
}) 

ipcMain.handle("get-port", () => {
  return httpProxy.port; 
}) 
ipcMain.handle("populate-local-data", () => {
  //return httpProxy.fillLocalData();
})

ipcMain.handle("update-folder-version", (ver) => {
  return httpProxy.current_version = ver; 
})



let customWindows = {}

ipcMain.handle("create-window", (event,windowName,path,config) => {
  if (customWindows.length >= 5){ // just to not abuse stuff
    return null
  }
  if (path == undefined) return null

  if (windowName in customWindows){
    console.log(`[INDEXJS] window already open ${windowName}`)
    return null
  }

  const win = new BrowserWindow(config)
  customWindows[windowName] = win
  
  win.on("close",()=>{
    console.log(`[INDEXJS] closing custom window ${windowName}`)
    delete customWindows[windowName]
  })
  
  console.log(`[INDEXJS] creating custom window ${windowName}`)
  win.loadFile(`Assets/${currentTheme}/` + path)
  
})



ipcMain.handle("send-to-window", (event, windowName,eventName,data) => {
  const win = customWindows[windowName]
  if (!win) return
  win.webContents.send(eventName,data)
})


ipcMain.handle("focus-window", (event, windowName) => {
  const win = customWindows[windowName]
  if (!win) return
  win.show();
  win.focus();
})

ipcMain.on("from-window", (event, customEvent, msg = null) => {
  if (currentWindow) {
    currentWindow.webContents.send("window-event", customEvent, msg)
  }
})

ipcMain.handle("close-window", (event,windowName) => {

  if (windowName in customWindows){
    console.log(`[INDEXJS] closing custom window ${windowName}`)
    const win = customWindows[windowName]
    win.close()
    delete customWindows[windowName]
  } else {
    console.log(`[INDEXJS] window ${windowName} doesnt exist?`)
  }
})


ipcMain.handle("net-fetch", async (event, options) => {
  return new Promise((resolve, reject) => {
    const request = net.request(options);

    let data = "";

    request.on("response", (response) => {
      response.on("data", chunk => data += chunk);
      response.on("end", () => {
        resolve({"status": response.statusCode, "data":data})
      });
    });

    request.on("error", reject);
    request.end(options.body || null);
  });
});



readyFlash()
console.log("PLUGIN PATH IS ", pluginPath)
console.log("USER PATH IS", app.getPath("userData"))
// install flash
app.commandLine.appendSwitch("ppapi-flash-path",pluginPath);

// app.commandLine.appendSwitch("ppapi-flash-version", "32.0.0.371"); // not needed


app.whenReady().then(createWindow)

