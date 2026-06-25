const goBack = document.getElementById('go-back');
goBack.addEventListener('click', () => {
    window.electronAPI.loadPage("index.html");
});


window.electronAPI.onCallbackData(async (data) => {
  document.getElementById("page-view").src = data
})
