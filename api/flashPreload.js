const { contextBridge,ipcRenderer } = require("electron");


// for desktop.animaljam.com
window.ipc = {
  on: (channel, fn) => {
    ipcRenderer.on(channel, (event, ...args) => {
      fn(event, ...args);
    });
  },

  once: (channel, fn) => {
    ipcRenderer.once(channel, (event, ...args) => {
      fn(event, ...args);
    });
  },

  sendToHost: (channel, ...args) => {
    ipcRenderer.sendToHost(channel, ...args);
  }
};

window.addEventListener("DOMContentLoaded", () => {
  const embed = document.getElementById("flash-content");
  if (embed) embed.setAttribute("swliveconnect", "true");
});