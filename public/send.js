const linkId = window.__LINK_ID__;

const loadingState = document.getElementById('loading-state');
const invalidState = document.getElementById('invalid-state');
const formState = document.getElementById('form-state');
const successState = document.getElementById('success-state');

const recipientName = document.getElementById('recipient-name');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message');
const charCount = document.getElementById('char-count');
const sendBtn = document.getElementById('send-btn');
const sendLabel = document.getElementById('send-label');
const sendSpinner = document.getElementById('send-spinner');
const sendError = document.getElementById('send-error');
const sendAnotherBtn = document.getElementById('send-another-btn');

function show(el) {
  [loadingState, invalidState, formState, successState].forEach((s) => s.classList.add('hidden'));
  el.classList.remove('hidden');
}

async function init() {
  if (!linkId) {
    show(invalidState);
    return;
  }
  try {
    const resp = await fetch(`/api/link-info/${encodeURIComponent(linkId)}`);
    if (!resp.ok) {
      show(invalidState);
      return;
    }
    const data = await resp.json();
    if (data.displayName) {
      recipientName.textContent = `Send ${data.displayName} an anonymous message`;
    }
    show(formState);
  } catch {
    show(invalidState);
  }
}

messageInput.addEventListener('input', () => {
  charCount.textContent = `${messageInput.value.length} / 2000`;
});

function setSending(isSending) {
  sendBtn.disabled = isSending;
  sendLabel.textContent = isSending ? 'Sending…' : 'Send anonymously';
  sendSpinner.classList.toggle('hidden', !isSending);
}

function showSendError(message) {
  sendError.textContent = message;
  sendError.classList.remove('hidden');
}

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  sendError.classList.add('hidden');

  const message = messageInput.value.trim();
  if (!message) {
    showSendError('Write something before sending.');
    return;
  }

  setSending(true);
  try {
    const resp = await fetch('/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: linkId, message }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      showSendError(data.error || 'Could not send your message. Please try again.');
      setSending(false);
      return;
    }

    show(successState);
  } catch {
    showSendError('Could not reach the server. Check your connection and try again.');
    setSending(false);
  }
});

sendAnotherBtn.addEventListener('click', () => {
  messageInput.value = '';
  charCount.textContent = '0 / 2000';
  show(formState);
});

init();
