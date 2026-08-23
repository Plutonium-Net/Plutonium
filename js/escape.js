window.addEventListener('message', event => {
  if (event.data && event.data.type === 'plu_navigate') {
    window.location.href = event.data.url
  }
})