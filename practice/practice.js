// Practice form: submitting it only shows a message (nothing is sent, nothing is tracked).
document.getElementById('application-form').addEventListener('submit', e => {
  e.preventDefault();
  document.getElementById('sent').textContent = '✓ Practice only: nothing was sent. On a real job site, this is the button you press yourself.';
});
