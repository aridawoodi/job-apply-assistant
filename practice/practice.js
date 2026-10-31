// Practice form: submitting it only shows a pretend confirmation (nothing is sent, nothing is tracked).
document.getElementById('application-form').addEventListener('submit', e => {
  e.preventDefault();
  const sent = document.getElementById('sent');
  if (!document.getElementById('consent').checked) {
    sent.textContent = 'Tick the consent box first: the assistant never ticks consent boxes for you.';
    return;
  }
  sent.textContent = '✓ Practice only: nothing was submitted or sent. On a real job site, this is the button you press yourself.';
  setTimeout(() => {
    document.getElementById('application-form').hidden = true;
    document.getElementById('confirmation').hidden = false;
    document.getElementById('confirmation').scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.dispatchEvent(new CustomEvent('jaa-practice-confirmed'));
  }, 600);
});
document.getElementById('again').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('application-form').hidden = false;
  document.getElementById('confirmation').hidden = true;
  document.getElementById('sent').textContent = '';
});

// v0.6.7: after a fill on this page, a calm "Practice fill done" note (the setup checklist ticks too)
window.addEventListener('jaa-filled', e => {
  if (!e.detail || !(e.detail.filled > 0) || /[?&]tour=1\b/.test(location.search)) return; // the tour has its own ending
  const done = document.getElementById('practiceDone');
  if (done && done.classList.contains('hidden')) { done.classList.remove('hidden'); done.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
});
