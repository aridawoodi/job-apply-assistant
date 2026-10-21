module.exports = function wdPage(step) {
  const steps = ['My Information', 'Application Questions', 'Review'];
  const bar = `<ol data-automation-id="progressBar">${steps.map((s, i) => `<li ${i === step - 1 ? 'data-automation-id="progressBarActiveStep"' : 'data-automation-id="progressBarInactiveStep"'}>${i === step - 1 ? 'current step ' + step + ' of 3 ' : ''}${s}</li>`).join('')}</ol>`;
  const dd = (id, label, opts) => `<div data-automation-id="formField-${id}"><label id="${id}-l">${label}</label><button type="button" aria-haspopup="listbox" data-automation-id="${id}" aria-labelledby="${id}-l" class="wd-dd">Select One</button></div>`;
  const txt = (id, label, type) => `<div data-automation-id="formField-${id}"><label for="${id}">${label}</label><input id="${id}" data-automation-id="${id}" type="${type || 'text'}"></div>`;
  const body = step === 1 ? txt('legalNameSection_firstName', 'Given Name(s)') + txt('legalNameSection_lastName', 'Family Name') + txt('email', 'Email Address', 'email') + txt('phone-number', 'Phone Number', 'tel') + dd('source', 'How Did You Hear About Us?')
    : step === 2 ? dd('sponsor', 'Will you now or in the future require sponsorship for employment visa status?') + dd('auth', 'Are you legally authorized to work in the United States?') + txt('years', 'How many years of experience with Python do you have?')
    : '<p>Review your application, then press Submit.</p>';
  const next = step < 3 ? `<button type="button" data-automation-id="bottom-navigation-next-button" id="next">Save and Continue</button>` : `<button type="button" data-automation-id="bottom-navigation-next-button" id="submit">Submit</button>`;
  return `<!doctype html><html><head><title>Software Engineer | Acme Careers</title><style>body{font:15px sans-serif;max-width:700px;margin:20px auto}[data-automation-id^="formField"]{margin:12px 0}label{display:block;font-weight:600}input{width:100%;padding:6px}[role=listbox]{border:1px solid #999;list-style:none;padding:0;margin:0;background:#fff}[role=option]{padding:6px}</style></head><body>
  <h2 data-automation-id="jobPostingHeader">Software Engineer</h2>${bar}
  <div data-automation-id="applyFlowPage"><h3>${steps[step - 1]}</h3>${body}</div>${next}
  <script>
   const OPTS = { source: ['LinkedIn', 'Indeed', 'Referral', 'Other'], sponsor: ['Yes', 'No'], auth: ['Yes', 'No'] };
   document.querySelectorAll('.wd-dd').forEach(b => b.addEventListener('click', () => {
     document.querySelectorAll('[role=listbox]').forEach(x => x.remove());
     const ul = document.createElement('ul'); ul.setAttribute('role', 'listbox');
     OPTS[b.dataset.automationId].forEach(o => { const li = document.createElement('li'); li.setAttribute('role', 'option'); li.setAttribute('data-automation-id', 'promptOption'); li.textContent = o; li.onclick = () => { b.textContent = o; ul.remove(); }; ul.appendChild(li); });
     b.after(ul);
   }));
   window.__nextClicks = [];
   document.getElementById('next') && (document.getElementById('next').onclick = e => { window.__nextClicks.push(e.isTrusted); sessionStorage.setItem('nextTrusted', JSON.stringify((JSON.parse(sessionStorage.getItem('nextTrusted') || '[]')).concat([e.isTrusted]))); location.href = location.pathname.replace(/step\\d$/, 'step${step + 1}'); });
  </script></body></html>`;
};
