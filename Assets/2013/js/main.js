const { shell } = require("electron")
const fs = require("fs")
const path = require("path")

let filePath = ""
let saveData = {}
let doneConfigLoad = false

let tried2fa = false
let errorPopupTimeout;

const loginSimplifier = window.LoginSimplifier
const loginBtn = document.getElementById('submit-play');
const otpMenu = document.getElementById("otp-menu");
const otpDarken = document.getElementById("otp-darken");

const otpInput = document.getElementById('otp-input');
const otpButton = document.getElementById('otp-button');

const userInput = document.getElementById('signin_user_screen_name')
const passInput = document.getElementById('signin_user_password')

let hasSession = false
let authToken = null
// FUNCTIONS

async function initConfig() {
	const userDataPath = await window.env.appUserData();
	window.env.updateVersion = await getVersion()


	filePath = path.join(userDataPath, "config.json");
	saveData = readStore()
	tryLoadData()

	doneConfigLoad = true
}
async function getVersion(){
	const res = await fetch("https://www.animaljam.com/flashvars")
	return await res.json().deploy_version
}


function readStore() {
	if (!fs.existsSync(filePath)) return {}
	return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function writeStore(data) {
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
}

function tryLoadData(){
  const username = saveData.username
  const rememberMe = saveData.rememberMe

  console.log(document.getElementById('signin_user_remember_me'))
  // console.log(saveData)
  authToken = saveData.authToken
  if (username && rememberMe){
    userInput.value = username;
    document.getElementById('signin_user_remember_me').checked = true;

    if (authToken != null){
      hasSession = true  
      sessionText.innerHTML = `logged in as <a>${username}</a>`
      return
    }
  }
  authToken = null
  sessionText.innerHTML = `<a>not</a> logged in`
  
}


function makeErrorMessage(msg){
	const errorPopup = document.getElementById('error-content');
	const errorText = document.getElementById('error-text');
	errorText.innerHTML = msg;
	errorPopup.classList.add('show');

	if (errorPopupTimeout) {
		clearTimeout(errorPopupTimeout);
	}

  errorPopupTimeout = setTimeout(() => {
    errorPopup.classList.remove('show');
  }, 3000);
}

function toggleOtpMenu(param1) {
  if (param1){
    otpMenu.classList.add('show');
    otpDarken.classList.add('show');
    otpInput.textContent = "";

    
  } else {
    otpMenu.classList.remove('show');
    otpDarken.classList.remove('show');
  }
}

function checkRememberMe(divID,checkID){
  const input = document.getElementById(divID)
  const checkbox = document.getElementById(checkID)
  const rememberMe = input.checked
  saveData.rememberMe = rememberMe
  
  if (input.value == 0) {
    checkbox.classList.add("checked");
    input.value = 1;
  } else {
    checkbox.classList.remove("checked");
    input.value = 0;
  }
}

function attemptLogin(otp = null){
	const user = userInput.value
	const pass = passInput.value

	if (!hasSession && (user == "" || pass == "")){
		makeErrorMessage("empty user or password")
		return
	} else if (hasSession && user == ""){
    makeErrorMessage("empty user")
		return
  }

  if (hasSession && authToken != null && passInput.value == ""){
    console.log("has session!")
    loginSimplifier.startTokenLogin({auth_token:authToken},otp,loginComplete);
    return
  }
	loginSimplifier.startLoginProcess(user, pass,otp,loginComplete);
}

function loginComplete(err, res = null){
  console.log("logged in boi")
  if (err == "success") {
    const rememberMe = document.getElementById('signin_user_remember_me').checked
    if (rememberMe){
      console.log("setting auth token ", res)
      saveData.username = userInput.value;
      saveData.authToken = res.auth_token;
    }
    saveData.rememberMe = rememberMe

    writeStore(saveData)
    window.electronAPI.loadPage("game.html",res);

  }else if (err.error == "otp"){
    if (!tried2fa){
      tried2fa = true
      toggleOtpMenu(true)
    } else {
      tried2fa = false // so we dont get stuck in a loop
      makeErrorMessage("wrong code bud")
    }
  } else{
    switch  (err.error){
      case 100:{
        makeErrorMessage("refresh token expired!")
        break
      }
      case 101:{
        makeErrorMessage("incorrect password or username")
        break
      }
      case 102:{
        makeErrorMessage("banned bozo")
        break
      }
      case 103:{
        makeErrorMessage("suspended lol")
        break
      }
      default: {
        makeErrorMessage("something went wrong! ", err.error)
        break
      }
    }
    
  }
}

function loadPage(url){
  window.electronAPI.loadPage("pageViewer.html",url);
}

function openRegister(){
  console.log("need to open register!")
  getFlashVars(gotFlashVarsToRegister)
}

async function getFlashVars(callback){
  var res = await fetch(this.env.flashVarsPath)
  var json = await res.json()
  callback(json)
}


function gotFlashVarsToRegister(res){
  console.log("got flash vars! ", res)
  var vars = res
  vars.webRefPath =  "create_account"
  window.electronAPI.loadPage("game.html",vars);
}


// LISTENERS

loginBtn.addEventListener('click',async (e) => {
    e.preventDefault();
    if (!await window.env.initialized() || !doneConfigLoad) {
      makeErrorMessage(doneConfigLoad ? "proxy not running" : "config not loaded")
      return
    }

    attemptLogin();
})
otpButton.addEventListener('click', () => {
  toggleOtpMenu(false);
  attemptLogin(otpInput.value);
})

userInput.addEventListener("input",()=>{
  if (authToken != null){
    authToken = null
    saveData.authToken = null
    hasSession = false
    writeStore(saveData)

    sessionText.innerHTML = `<a>not</a> logged in`
    console.log("[LOGIN] invalidating session")
  }
})


initConfig()

// async function debugErr(){
//   const userDataPath = await window.env.appUserData();
//   console.log("[USER DATA PATH] ",userDataPath)
//   console.log("[PROXY PATH] ", path.join(userDataPath, "proxy"))
// }
// debugErr()
